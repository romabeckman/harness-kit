import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Complexity, Phase } from '../types'
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
import { getSpecsDir } from '../utils/PhaseFileUtils'
import type { ReviewPayload } from '../../context-assembler/types'
import type { BootstrapConfig, Feature, FeatureStatus } from '../../file-state/types'
import type { ValidationScores } from '../../validation-gate/types'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'

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

    // --skip-validation: bypass all agent calls and jump straight to Phase D
    if (context.config.skipValidation) {
      process.stdout.write(`[phase_review] --skip-validation active — skipping review for feature ${activeFeature.id}\n`)
      clearFeatureDeveloperSessions(context)
      context.fsm.updateFeatureStatus(activeFeature.id, 'COMPLETED', { tl: 1, adv: 1 })
      context.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'COMPLETED')
      return Phase.TRANSITION
    }

    this.cleanTemporaryFiles(context, activeFeature.domain)

    const config = context.fsm.loadBootstrapConfig()
    const payload = ContextAssembler.buildReviewPayload(
      activeFeature,
      context.workingDir,
      context.config.projectPaths,
      config.steeringRules
    )

    const [tlOutput, advOutput] = await this.executeAgents(context, payload, config)

    const scores = this.extractScores(context, activeFeature.domain, tlOutput, advOutput)

    const result = ValidationGate.evaluate(
      scores,
      activeFeature.reworks,
      config
    )

    return this.processDecision(context, activeFeature, phase, result, scores)
  }

  private cleanTemporaryFiles(context: Reviewontext, domain: string): void {
    const specsDir = getSpecsDir(context.workingDir, domain)
    for (const file of ['TL.json', 'QA.json']) {
      const p = join(specsDir, file)
      if (existsSync(p)) rmSync(p, { force: true })
    }
  }

  private async executeAgents(context: Reviewontext, payload: ReviewPayload, config: BootstrapConfig) {
    const tlPrompt = this.buildTechLeadPrompt(payload, context, config)
    const advPrompt = this.buildAdversarialQAPrompt(payload, context, config)
    const isSimple = context.config.complexity === Complexity.LOW

    const tlMock = { featureId: payload.featureId, score: 1, openPoints: [], architectureTip: '' }
    const specsDir = getSpecsDir(context.workingDir, payload.domain)

    if (isSimple && existsSync(specsDir)) {
      writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(tlMock, null, 2), 'utf8')
    }

    const tlAgent = 'harness-kit:harness-tech-lead'
    const advAgent = 'harness-kit:harness-qa'

    const tlSession = context.getDeveloperSession?.(tlAgent, payload.featureId, Phase.REVIEW)
    const advSession = context.getDeveloperSession?.(advAgent, payload.featureId, Phase.REVIEW)

    const tlPromise = isSimple
      ? Promise.resolve(tlMock)
      : context.invokeAgent({
        skill: 'harness-kit:the-grumpy-tech-lead',
        agent: tlAgent,
        mode: 'autonomous',
        prompt: tlPrompt,
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

    return Promise.all([tlPromise, advPromise])
  }

  private extractScores(context: Reviewontext, domain: string, tlOutput: any, advOutput: any) {
    const specsDir = getSpecsDir(context.workingDir, domain)
    const tlData = this.parseAgentOutput(join(specsDir, 'TL.json'), tlOutput, 'review_tl')
    const advData = this.parseAgentOutput(join(specsDir, 'QA.json'), advOutput, 'review_adv')

    return {
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

    const tddOutputPath = join(context.workingDir, 'docs', 'specs', activeFeature.domain, 'TDD-OUTPUT.json')
    if (existsSync(tddOutputPath)) rmSync(tddOutputPath, { force: true })

    // If verification needs rework, transition back to retry handler
    if (result.verdict === 'RETRY') {
      return this.handleRetry(context, activeFeature, scores)
    }

    // Map validation gate verdicts to corresponding bootstrap statuses
    const statusMap: Record<string, FeatureStatus> = {
      'PASS': 'COMPLETED',
      'BLOCK': 'BLOCKED',
      'FAIL': 'FAILED'
    }

    activeFeature.status = statusMap[result.verdict] || activeFeature.status
    context.fsm.updateFeatureStatus(activeFeature.id, activeFeature.status, { tl: scores.scoreTL, adv: scores.scoreAdv })
    context.fsm.updateAllFeatureTasks(activeFeature.id, '-', activeFeature.status)

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

    const reworkSection = buildReworkSection(reworkLogPath, payload.totalReworks, existsSync(reworkLogPath))

    return [
      `## Objective`,
      `Review the implementation for this feature as a Senior Tech Lead. Give an HONEST, EVIDENCE-BASED verdict on the code's real state; do not target a finding quota.`,
      ``,
      `<skill_context>`,
      `Invoke the \`harness-kit:the-grumpy-tech-lead\` skill before evaluating openPoints.`,
      `Mode: autonomous`,
      `</skill_context>`,
      ``,
      `<react_workflow>`,
      `- THOUGHT: Analyze the architectural contract and implementation for concrete flaws or bad practices.`,
      `- ACTION: Inspect specific files and lines of code.`,
      `- OBSERVATION: Confirm if the issue poses a real, verifiable impact before adding it to open points.`,
      `</react_workflow>`,
      ``,
      EVALUATION_PRINCIPLE_TL,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- openPoints MUST contain 0–6 Socratic questions, each grounded in concrete code evidence and explaining the production impact; never write implementation directives`,
      `- Do NOT force a CRITICAL/HIGH finding when none genuinely exists   an empty or low-severity-only openPoints list is expected for solid code`,
      `- Each openPoint MUST start with [CRITICAL], [HIGH], [MEDIUM], or [LOW]`,
      `- score must be a float in [0.00, 1.00] rounded to 2 decimals, computed from severity weights of REAL findings only`,
      `</strict_rules>`,
      ``,
      `<validation_config>`,
      `scoreThresholdTL: ${config.scoreThresholdTL}`,
      `</validation_config>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<scope>`,
      `\`\`\`markdown`,
      (context.config.scope || '').trim(),
      `\`\`\``,
      `</scope>`,
      ``,
      `<expected_output>`,
      `Write a raw JSON object to \`${specsDir}/TL.json\` and return the same raw object with no Markdown fences or prose:`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "score": 0.00,`,
      `  "openPoints": [`,
      `    "[CRITICAL|HIGH|MEDIUM|LOW] <file>:<line> — What prevents <failure mode>? Evidence: <observed code>. Impact: <production consequence>."`,
      `  ],`,
      `  "architectureTip": "Single actionable sentence recommending an architectural improvement"`,
      `}`,
      `Note: openPoints may be an empty array [] when no issue meets the evaluation_principle bar. An empty array with a high score is a fully valid response.`,
      `</expected_output>`,
      ``,
      `<spec_sources>`,
      `- Development log: \`${specsDir}/TDD-OUTPUT.json\` or \`git status -s\` to list all modified files in each project.`,
      ...inlineOrReference('problem_space', payload.specsContent?.problemSpace, join(specsDir, '001-problem-space.md'), 'markdown'),
      ...inlineOrReference('context_map', payload.specsContent?.contextMap, join(specsDir, '002-context-map.md'), 'markdown'),
      ...inlineOrReference('tactical_design', payload.specsContent?.tacticalDesign, join(specsDir, '003-*-tactical-design.md'), 'markdown', 'always'),
      ...inlineOrReference('test_scenarios', payload.specsContent?.testScenarios, join(specsDir, '004-*-test-scenarios.md'), 'markdown', 'always'),
      `</spec_sources>`,
      ``,
      `<inputs>`,
      ...buildDocsOrientationSection(payload.projectPaths, workingDir),
      `<feature>`,
      `Feature ID: ${payload.featureId}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</feature>`,
      ``,
      ...reworkSection,
      `</inputs>`,
    ].join('\n')
  }

  private buildAdversarialQAPrompt(payload: ReviewPayload, context: Reviewontext, config: BootstrapConfig): string {
    const workingDir = context.workingDir
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const rulesSection = payload.steeringRules?.length
      ? payload.steeringRules.map(r => `- ${r}`).join('\n')
      : '- No additional rules provided'

    const specsDir = join(workingDir, 'docs', 'specs', payload.domain)
    const reworkLogPath = join(workingDir, 'docs', 'specs', payload.domain, 'REWORK-LOG.md')

    const reworkSection = buildReworkSection(reworkLogPath, payload.totalReworks, existsSync(reworkLogPath))

    return [
      `## Objective`,
      `Attempt to break this feature's implementation by probing edge cases, boundary faults, and security vulnerabilities that standard TDD might miss. Report only what you find in the CURRENT code; do not target a vulnerability quota.`,
      ``,
      `<skill_context>`,
      `Invoke the \`harness-kit:adversarial-qa\` skill before starting.`,
      `Mode: autonomous`,
      `</skill_context>`,
      ``,
      `<react_workflow>`,
      `- THOUGHT: Hypothesize security vulnerabilities, missing boundary tests, and edge cases.`,
      `- ACTION: Probe the test scenarios and modified files for exploitability.`,
      `- OBSERVATION: Validate if the code demonstrably fails the hypothesis before reporting it as a vulnerability.`,
      `</react_workflow>`,
      ``,
      EVALUATION_PRINCIPLE_QA,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- Any HIGH or CRITICAL vulnerability triggers RETRY regardless of score   but only report HIGH/CRITICAL when exploitability is demonstrated, not assumed`,
      `- Do NOT force a vulnerability or edge case finding when none genuinely exists   empty arrays with passedAdversarial: true is expected for solid code`,
      `- score must be a float in [0.00, 1.00] rounded to 2 decimals`,
      `</strict_rules>`,
      ``,
      `<validation_config>`,
      `scoreThresholdAdv: ${config.scoreThresholdAdv}`,
      `</validation_config>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<scope>`,
      `\`\`\`markdown`,
      (context.config.scope || '').trim(),
      `\`\`\``,
      `</scope>`,
      ``,
      `<expected_output>`,
      `Write a raw JSON object to \`${specsDir}/QA.json\` and return the same raw object with no Markdown fences or prose:`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "score": 0.00,`,
      `  "passedAdversarial": false,`,
      `  "hasHighCriticalVuln": false,`,
      `  "isCrashing": false,`,
      `  "vulnerabilities": [`,
      `    { "type": "SQL_INJECTION", "severity": "HIGH", "description": "Specific location and impact." }`,
      `  ],`,
      `  "edgeCasesMissed": ["Description of untested scenario from 004-*-test-scenarios.md or concrete failure vector"]`,
      `}`,
      `Allowed severity values: LOW, MEDIUM, HIGH, CRITICAL. Use a concise uppercase vulnerability type.`,
      `Note: vulnerabilities and edgeCasesMissed may be empty arrays when nothing meets the evaluation_principle bar. In that case passedAdversarial should be true and hasHighCriticalVuln false.`,
      `</expected_output>`,
      ``,
      `<spec_sources>`,
      `- Development log: \`${specsDir}/TDD-OUTPUT.json\` or \`git status -s\` to list all modified files in each project.`,
      ...inlineOrReference('problem_space', payload.specsContent?.problemSpace, join(specsDir, '001-problem-space.md'), 'markdown'),
      ...inlineOrReference('context_map', payload.specsContent?.contextMap, join(specsDir, '002-context-map.md'), 'markdown'),
      ...inlineOrReference('tactical_design', payload.specsContent?.tacticalDesign, join(specsDir, '003-*-tactical-design.md'), 'markdown', 'always'),
      ...inlineOrReference('test_scenarios', payload.specsContent?.testScenarios, join(specsDir, '004-*-test-scenarios.md'), 'markdown', 'always'),
      `</spec_sources>`,
      ``,
      `<inputs>`,
      ...buildDocsOrientationSection(payload.projectPaths, workingDir),
      `<feature>`,
      `Feature ID: ${payload.featureId}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</feature>`,
      ``,
      ...reworkSection,
      `</inputs>`,
    ].join('\n')
  }
}
