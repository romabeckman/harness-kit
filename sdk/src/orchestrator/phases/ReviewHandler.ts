import { loadPrompt } from '../utils/PromptTemplate'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import { ValidationGate } from '../../validation-gate/ValidationGate'
import {
  EVALUATION_PRINCIPLE_TL,
  EVALUATION_PRINCIPLE_QA,
  buildReworkSection,
  inlineOrReference,
  buildDocsOrientationSection
} from '../utils/PromptHelpers'
import { clearFeatureDeveloperSessions } from '../utils/SessionHelpers'
import { getPlanningSource, getProductDir, getSpecsDir, readCompletedTddOutput, readTddOutput } from '../utils/PhaseFileUtils'
import type { TddOutput } from '../utils/PhaseFileUtils'
import type { DreamingEpisode } from '../../file-state/DreamingEpisodeStore'
import { buildDreamingPrompt, dreamingFingerprint, validateDreamingReceipt } from '../../file-state/DreamingAnalysis'
import type { ReviewPayload } from '../../context-assembler/types'
import type { BootstrapConfig, Feature, FeatureStatus } from '../../file-state/types'
import { Verdict } from '../../validation-gate/types'
import type { ValidationScores } from '../../validation-gate/types'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import { ReviewFailureService } from '../services/ReviewFailureService'

type ValidationResult = ReturnType<typeof ValidationGate.evaluate>;

export class ReviewHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.REVIEW) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) {
      throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)
    }

    const config = context.fsm.loadBootstrapConfig()
    const reviewFailures = new ReviewFailureService(context, config, activeFeature.id)

    const tddPath = join(getSpecsDir(context.workingDir, activeFeature.domain), 'TDD-OUTPUT.json')
    let tddProblem: string | undefined
    try {
      readCompletedTddOutput(tddPath, activeFeature.id, activeFeature.reworks)
    } catch (error) {
      tddProblem = error instanceof Error ? error.message : String(error)
      try {
        const report = JSON.parse(readFileSync(tddPath, 'utf8'))
        if (report.featureId === activeFeature.id && report.reworksCount === activeFeature.reworks && typeof report.developerHandoff === 'string') tddProblem += `; ${report.developerHandoff}`
      } catch { /* retain the validation error */ }
    }

    // An incomplete TDD result must be reviewed even when validation is normally skipped.
    if (context.config.skipValidation && !tddProblem) {
      if (reviewFailures.preservePolicyBlock()) {
        this.recordReview(context, activeFeature, 'INTERRUPTED')
        this.clearTddOutput(context.workingDir, activeFeature.domain)
        return Phase.TRANSITION
      }
      process.stdout.write(`[phase_review] --skip-validation active — skipping review for feature ${activeFeature.id}\n`)
      this.recordReview(context, activeFeature, 'SKIPPED')
      clearFeatureDeveloperSessions(context)
      context.fsm.updateFeatureStatus(activeFeature.id, 'COMPLETED')
      context.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'COMPLETED')
      context.fsm.appendDecision({
        featureId: activeFeature.id,
        decision: `REVIEW skipped by execution policy for feature ${activeFeature.id}.`,
      })
      this.clearTddOutput(context.workingDir, activeFeature.domain)
      return Phase.TRANSITION
    }

    const planningSource = getPlanningSource(context)
    if (planningSource.exists) {
      context.config.scope = planningSource.content
    }

    this.cleanTemporaryFiles(context, activeFeature.domain)

    const payload = ContextAssembler.buildReviewPayload(
      activeFeature,
      context.workingDir,
      context.config.projectPaths,
      config.steeringRules
    )

    try {
      const report = readTddOutput(tddPath)
      if (report.featureId !== activeFeature.id || report.reworksCount !== activeFeature.reworks) payload.tddSummary = undefined
    } catch { payload.tddSummary = undefined }

    const results = await this.executeAgents(context, payload, config, tddProblem)
    let outputs: ReturnType<ReviewFailureService['resolveOutputs']>
    try {
      outputs = reviewFailures.resolveOutputs(results)
    } catch (error) {
      this.recordReview(context, activeFeature, 'INTERRUPTED')
      throw error
    }
    if (!outputs) {
      this.recordReview(context, activeFeature, 'INTERRUPTED')
      this.clearTddOutput(context.workingDir, activeFeature.domain)
      return Phase.TRANSITION
    }

    const [techLead, adversarial] = outputs
    const { scores, evidence, hasReviewerResults } = this.extractScores(context, activeFeature.domain, techLead, adversarial)

    let result = ValidationGate.evaluate(
      scores,
      activeFeature.reworks,
      config
    )
    if (tddProblem && result.verdict === Verdict.PASS) {
      const exhausted = activeFeature.reworks >= config.completionCriteria.maxReworks
      result = { verdict: exhausted ? Verdict.FAIL : Verdict.RETRY, reason: `TDD output requires correction: ${tddProblem}` }
    }
    if (tddProblem) scores.openPoints = [...(scores.openPoints ?? []), `TDD output requires correction: ${tddProblem}`]

    const sessions = [techLead.session?.id, adversarial.session?.id].filter((id): id is string => !!id)
    const episode = this.recordReview(context, activeFeature, hasReviewerResults ? result.verdict : 'INTERRUPTED', sessions, hasReviewerResults ? evidence : [])
    const nextPhase = this.processDecision(context, activeFeature, phase, result, scores)
    if (result.verdict === 'PASS') reviewFailures.clearPolicyBlock()
    if (episode?.review === 'PASS') await this.reviewLearningTriggers(context, episode)
    return nextPhase
  }

  private cleanTemporaryFiles(context: Reviewontext, domain: string): void {
    const specsDir = getSpecsDir(context.workingDir, domain)
    for (const file of ['TL.json', 'QA.json']) {
      const p = join(specsDir, file)
      if (existsSync(p)) rmSync(p, { force: true })
    }
  }

  private clearTddOutput(workingDir: string, domain: string): void {
    rmSync(join(getSpecsDir(workingDir, domain), 'TDD-OUTPUT.json'), { force: true })
  }

  private recordReview(
    context: Reviewontext, feature: Feature, verdict: NonNullable<DreamingEpisode['review']>,
    sessions?: string[], evidence?: unknown[],
  ): DreamingEpisode | undefined {
    if (!context.dreaming) return
    let output: TddOutput
    try {
      output = readTddOutput(join(getSpecsDir(context.workingDir, feature.domain), 'TDD-OUTPUT.json'))
      if (output.featureId !== feature.id || output.reworksCount !== feature.reworks) return
    } catch {
      return
    }
    return context.dreaming.recordReview(feature, output, verdict, sessions, evidence)
  }

  private async reviewLearningTriggers(context: Reviewontext, episode: DreamingEpisode): Promise<void> {
    for (const project of episode.projects) {
      const chain = context.dreaming!.learningChain(episode, project.root)
      const fingerprint = dreamingFingerprint(chain.attempts)
      let raw = ''
      try {
        if (chain.error) raw = JSON.stringify({ episode_id: episode.id, status: 'incomplete', reason: chain.error })
        else {
          const result = await context.invokeAgent({
            agent: 'harness-kit:software-architect', skill: 'harness-kit:project-dreaming', mode: 'autonomous',
            domain: episode.domain, workspacePath: project.root,
            prompt: buildDreamingPrompt({ project: project.root, feature: episode.domain, episode_id: episode.id,
              attempts: chain.attempts, handoff_directory: join(getProductDir(context), 'project-dreaming', 'handoffs') }, false),
          })
          raw = result.success === false ? JSON.stringify({ episode_id: episode.id, status: 'incomplete', reason: result.raw || 'Dreaming runner failed.' }) : result.raw
        }
      } catch (error) {
        console.warn('[project-dreaming] Post-acceptance review failed:', error)
        raw = JSON.stringify({ episode_id: episode.id, status: 'incomplete', reason: error instanceof Error ? error.message : String(error) })
      }
      const receipt = validateDreamingReceipt(raw, project.root, episode.id, chain.attempts.map(attempt => attempt.id))
      context.dreaming!.recordAnalysis(episode.id, project.root, fingerprint, receipt)
      if (receipt.status === 'incomplete') context.fsm.appendDecision({ featureId: episode.featureId, decision: `Retry Project Dreaming for episode ${episode.id} in ${project.root}: ${receipt.reason}` })
    }
  }

  private async executeAgents(context: Reviewontext, payload: ReviewPayload, config: BootstrapConfig, tddProblem?: string) {
    const tddNotice = tddProblem ? `\n\nTDD output requires review and correction: ${tddProblem}` : ''
    const tlPrompt = this.buildTechLeadPrompt(payload, context, config) + tddNotice
    const advPrompt = this.buildAdversarialQAPrompt(payload, context, config) + tddNotice

    const tlAgent = 'harness-kit:harness-tech-lead'
    const advAgent = 'harness-kit:harness-qa'

    const tlSession = context.getDeveloperSession?.(tlAgent, payload.featureId, Phase.REVIEW)
    const advSession = context.getDeveloperSession?.(advAgent, payload.featureId, Phase.REVIEW)

    const tlPromise = context.invokeAgent({
      skill: 'harness-kit:the-grumpy-tech-lead',
      agent: tlAgent,
      mode: 'autonomous',
      prompt: tlPrompt,
      payload: { featureId: payload.featureId, domain: payload.domain },
      phaseKey: 'review_tl',
      domain: payload.domain,
      ...(tlSession ? { session: tlSession } : {}),
    }).then(output => {
      if (output.session) {
        context.setDeveloperSession?.({
          featureId: payload.featureId,
          agent: tlAgent,
          session: output.session,
          phase: Phase.REVIEW,
        })
      }
      return output
    })

    const advPromise = context.invokeAgent({
      skill: 'harness-kit:adversarial-qa',
      agent: advAgent,
      mode: 'autonomous',
      prompt: advPrompt,
      payload: { featureId: payload.featureId, domain: payload.domain },
      phaseKey: 'review_adv',
      domain: payload.domain,
      ...(advSession ? { session: advSession } : {}),
    }).then(output => {
      if (output.session) {
        context.setDeveloperSession?.({
          featureId: payload.featureId,
          agent: advAgent,
          session: output.session,
          phase: Phase.REVIEW,
        })
      }
      return output
    })

    return Promise.allSettled([tlPromise, advPromise] as const)
  }

  private extractScores(context: Reviewontext, domain: string, tlOutput: any, advOutput: any) {
    const specsDir = getSpecsDir(context.workingDir, domain)
    const tlData = this.parseAgentOutput(join(specsDir, 'TL.json'), tlOutput, 'review_tl')
    const advData = this.parseAgentOutput(join(specsDir, 'QA.json'), advOutput, 'review_adv')

    const scores = {
      scoreTL: typeof tlData['score'] === 'number' ? tlData['score'] : (typeof tlData['scoreTL'] === 'number' ? tlData['scoreTL'] : 0),
      scoreAdv: typeof advData['score'] === 'number' ? advData['score'] : (typeof advData['scoreAdv'] === 'number' ? advData['scoreAdv'] : 0),
      hasHighCriticalVuln: advData['hasHighCriticalVuln'] === true,
      isCrashing: advData['isCrashing'] === true || tlData['isCrashing'] === true,
      // TheGrumpyTechLead
      openPoints: Array.isArray(tlData['openPoints']) ? tlData['openPoints'] : [],
      architectureTip: typeof tlData['architectureTip'] === 'string' ? tlData['architectureTip'] : undefined,
      // AdversarialQA
      edgeCasesMissed: Array.isArray(advData['edgeCasesMissed']) ? advData['edgeCasesMissed'] : [],
      vulnerabilities: Array.isArray(advData['vulnerabilities']) ? advData['vulnerabilities'] : []
    }
    const evidence = [tlData, advData].flatMap(data => Array.isArray(data.learning_evidence) ? data.learning_evidence : [])
    const hasReviewerResults = tlOutput.success !== false && advOutput.success !== false
      && (typeof tlData.score === 'number' || typeof tlData.scoreTL === 'number')
      && (typeof advData.score === 'number' || typeof advData.scoreAdv === 'number')
    return { scores, evidence, hasReviewerResults }
  }

  private parseAgentOutput(filePath: string, agentOutput: any, logPrefix: string): Record<string, unknown> {
    let extraction: any
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf8')
        extraction = { data: JSON.parse(content) }
      } catch (err: any) {
        process.stderr.write(`[${logPrefix}] Failed to parse JSON file: ${err.message}\n`)
      }
    }

    if (!extraction) {
      extraction = agentOutput.artefacts && Object.keys(agentOutput.artefacts).length > 0
        ? { data: agentOutput.artefacts }
        : JsonExtractionProtocol.extract(agentOutput.raw)
    }

    if (isExtractionResult(extraction)) {
      return extraction.data as Record<string, unknown>
    }
    process.stderr.write(`[${logPrefix}] JSON extraction failed.\nRaw output (first 500 chars): ${agentOutput.raw?.slice(0, 500)}\n`)
    return {}
  }

  /**
   * Processes the validation gate evaluation result and decides the next workflow step.
   * Logs decisions, manages feature state transitions, and moves to TRANSITION or retries.
   */
  private processDecision(
    context: Reviewontext,
    activeFeature: Feature,
    phase: Phase,
    result: ValidationResult,
    scores: ValidationScores
  ): Phase {
    // Append verification decision log with scores and rationale
    PhaseDecisionLogger.logReview(
      context.fsm,
      activeFeature,
      result.verdict,
      scores.scoreTL,
      scores.scoreAdv,
      result.reason
    )

    // If verification needs rework, transition back to retry handler
    if (result.verdict === 'RETRY') {
      const next = this.handleRetry(context, activeFeature, scores)
      this.clearTddOutput(context.workingDir, activeFeature.domain)
      return next
    }

    // Map validation gate verdicts to corresponding bootstrap statuses
    const statusMap: Record<string, FeatureStatus> = {
      'PASS': 'COMPLETED',
      'BLOCK': 'BLOCKED',
      'FAIL': 'FAILED'
    }

    activeFeature.status = statusMap[result.verdict] || activeFeature.status
    context.fsm.updateAllFeatureTasks(activeFeature.id, '-', activeFeature.status)
    context.fsm.updateFeatureStatus(activeFeature.id, activeFeature.status, { tl: scores.scoreTL, adv: scores.scoreAdv })
    this.clearTddOutput(context.workingDir, activeFeature.domain)

    // Clear developer session upon exiting the dev/review cycle for this feature
    clearFeatureDeveloperSessions(context)

    // Proceed to TRANSITION
    return Phase.TRANSITION
  }

  private handleRetry(context: Reviewontext, activeFeature: Feature, scores: ValidationScores): Phase {
    context.fsm.incrementReworks(activeFeature.id)
    context.fsm.writeReworkLog(activeFeature.domain, this.buildReworkContent(scores))
    context.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'NOT_STARTED')
    return Phase.DEVELOPMENT
  }

  private buildReworkContent(scores: ValidationScores): string {
    const sections: string[] = []

    if (scores.openPoints?.length) {
      sections.push(`### Action Items (Tech Lead)\n\n${scores.openPoints.map(p => `- [ ] FIX: ${p}`).join('\n')}`)
    }
    if (scores.architectureTip) {
      sections.push(`### Architecture Tip\n\n${scores.architectureTip}`)
    }
    if (scores.vulnerabilities?.length) {
      const list = scores.vulnerabilities.map(v => `- [ ] FIX: [${v.severity ?? 'UNKNOWN'}] ${v.description ?? 'Unspecified'}`).join('\n')
      sections.push(`### Vulnerabilities\n\n${list}`)
    }
    if (scores.edgeCasesMissed?.length) {
      sections.push(`### Edge Cases Missed\n\n${scores.edgeCasesMissed.map(e => `- [ ] FIX: ${e}`).join('\n')}`)
    }

    return sections.length > 0 ? sections.join('\n\n') : `Score TL: ${scores.scoreTL}, Score Adv: ${scores.scoreAdv}`
  }

  private buildTechLeadPrompt(payload: ReviewPayload, context: Reviewontext, config: BootstrapConfig): string {
    const workingDir = context.workingDir
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const rulesSection = payload.steeringRules?.length
      ? payload.steeringRules.map(r => `- ${r}`).join('\n')
      : '- No additional rules provided'

    const specsDir = join(workingDir, 'docs', 'specs', payload.domain)
    const reworkLogPath = join(workingDir, 'docs', 'specs', payload.domain, 'REWORK-LOG.md')

    const reworkSection = buildReworkSection(reworkLogPath, payload.totalReworks, existsSync(reworkLogPath), 'always', context.config.agentRunner)
    const tddSummary = this.buildTddSummary(payload)

    return loadPrompt('review/tech-lead', {
      EVALUATION_PRINCIPLE_TL: EVALUATION_PRINCIPLE_TL,
      scoreThresholdTL: config.scoreThresholdTL,
      rulesSection: rulesSection,
      projectPathsList: projectPathsList,
      scope: (context.config.scope || '').trim(),
      specsDir: specsDir,
      featureId: payload.featureId,
      specsDir2: specsDir,
      tddSummary: tddSummary,
      specificationProvenance: this.buildSpecificationProvenance(specsDir),
      developerHandoff: payload.developerHandoff ?? 'No developer handoff provided.',
      problemSpaceSection: inlineOrReference('problem_space', payload.specsContent?.problemSpace, join(specsDir, '001-problem-space.md'), 'markdown', 'never', context.config.agentRunner),
      contextMapSection: inlineOrReference('context_map', payload.specsContent?.contextMap, join(specsDir, '002-context-map.md'), 'markdown', 'never', context.config.agentRunner),
      tacticalDesignSection: inlineOrReference('tactical_design', payload.specsContent?.tacticalDesign, join(specsDir, '003-*-tactical-design.md'), 'markdown', 'always', context.config.agentRunner),
      testScenariosSection: inlineOrReference('test_scenarios', payload.specsContent?.testScenarios, join(specsDir, '004-*-test-scenarios.md'), 'markdown', 'always', context.config.agentRunner),
      docsOrientationSection: buildDocsOrientationSection(payload.projectPaths, workingDir, undefined, undefined, context.config.agentRunner),
      featureId2: payload.featureId,
      featureTitle: payload.featureTitle,
      domain: payload.domain,
      reworkSection: reworkSection,
    })
  }

  private buildAdversarialQAPrompt(payload: ReviewPayload, context: Reviewontext, config: BootstrapConfig): string {
    const workingDir = context.workingDir
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const rulesSection = payload.steeringRules?.length
      ? payload.steeringRules.map(r => `- ${r}`).join('\n')
      : '- No additional rules provided'

    const specsDir = join(workingDir, 'docs', 'specs', payload.domain)
    const reworkLogPath = join(workingDir, 'docs', 'specs', payload.domain, 'REWORK-LOG.md')

    const reworkSection = buildReworkSection(reworkLogPath, payload.totalReworks, existsSync(reworkLogPath), 'always', context.config.agentRunner)
    const tddSummary = this.buildTddSummary(payload)

    return loadPrompt('review/adversarial-qa', {
      EVALUATION_PRINCIPLE_QA: EVALUATION_PRINCIPLE_QA,
      scoreThresholdAdv: config.scoreThresholdAdv,
      rulesSection: rulesSection,
      projectPathsList: projectPathsList,
      scope: (context.config.scope || '').trim(),
      specsDir: specsDir,
      featureId: payload.featureId,
      specsDir2: specsDir,
      tddSummary: tddSummary,
      specificationProvenance: this.buildSpecificationProvenance(specsDir),
      developerHandoff: payload.developerHandoff ?? 'No developer handoff provided.',
      problemSpaceSection: inlineOrReference('problem_space', payload.specsContent?.problemSpace, join(specsDir, '001-problem-space.md'), 'markdown', 'never', context.config.agentRunner),
      contextMapSection: inlineOrReference('context_map', payload.specsContent?.contextMap, join(specsDir, '002-context-map.md'), 'markdown', 'never', context.config.agentRunner),
      tacticalDesignSection: inlineOrReference('tactical_design', payload.specsContent?.tacticalDesign, join(specsDir, '003-*-tactical-design.md'), 'markdown', 'always', context.config.agentRunner),
      testScenariosSection: inlineOrReference('test_scenarios', payload.specsContent?.testScenarios, join(specsDir, '004-*-test-scenarios.md'), 'markdown', 'always', context.config.agentRunner),
      docsOrientationSection: buildDocsOrientationSection(payload.projectPaths, workingDir, undefined, undefined, context.config.agentRunner),
      featureId2: payload.featureId,
      featureTitle: payload.featureTitle,
      domain: payload.domain,
      reworkSection: reworkSection,
    })
  }

  private buildTddSummary(payload: ReviewPayload): string[] {
    const summary = payload.tddSummary
    if (!summary) return []

    return [
      `<tdd_summary>`,
      `Status: ${summary.status}`,
      `Tests: ${summary.metrics.totalTests} total, ${summary.metrics.passed} passed, ${summary.metrics.failed} failed`,
      `Coverage: ${summary.metrics.coverage}`,
      `Modified files: ${summary.modifiedFiles.length > 0 ? summary.modifiedFiles.join(', ') : 'None reported'}`,
      `Reworks: ${summary.reworksCount}`,
      `Developer handoff: ${summary.developerHandoff ?? 'Not provided'}`,
      `</tdd_summary>`,
    ]
  }

  private buildSpecificationProvenance(specsDir: string): string[] {
    return [
      `<specification_provenance>`,
      `- Domain-wide context: \`${join(specsDir, '001-problem-space.md')}\` and \`${join(specsDir, '002-context-map.md')}\`.`,
      `- Project-specific contracts: files matching \`${join(specsDir, '003-*-tactical-design.md')}\` and \`${join(specsDir, '004-*-test-scenarios.md')}\`.`,
      `- In concatenated 003/004 content, each \`<!-- File: ... -->\` marker identifies the owning project artifact. Match findings to that artifact and its project path.`,
      `</specification_provenance>`,
    ]
  }
}
