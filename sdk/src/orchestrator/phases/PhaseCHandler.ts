import { existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import { ValidationGate } from '../../validation-gate/ValidationGate'
import type { PhaseCPayload } from '../../context-assembler/types'
import type { BootstrapConfig, Feature } from '../../file-state/types'
import type { ValidationScores } from '../../validation-gate/types'

type ValidationResult = ReturnType<typeof ValidationGate.evaluate>;

export class PhaseCHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_C) {
      return super.handle(phase, context)
    }

    const activeFeature = this.getActiveFeature(context)
    const config = context.fsm.loadBootstrapConfig()

    this.cleanTemporaryFiles(context, activeFeature.domain)

    const payload = ContextAssembler.buildPhaseCPayload(
      activeFeature,
      context.config.projectPaths,
      config.steeringRules
    )

    const [tlOutput, advOutput] = await this.executeAgents(context, payload, config)

    const scores = this.extractScores(context, activeFeature.domain, tlOutput, advOutput)

    const result = ValidationGate.evaluate(
      scores,
      activeFeature.reworks,
      config,
      scores.isCrashing
    )

    return this.processDecision(context, activeFeature, config, result, scores)
  }

  private getActiveFeature(context: PhaseContext): Feature {
    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) {
      throw new Error('Illegal state: phase PHASE_C requires an active feature but none is set')
    }
    return activeFeature
  }

  private cleanTemporaryFiles(context: PhaseContext, domain: string): void {
    const specsDir = join(context.workingDir, 'docs', 'specs', domain)
    for (const file of ['TDD-OUTPUT-TEMP.jsonl', 'TL.json', 'QA.json']) {
      const p = join(specsDir, file)
      if (existsSync(p)) rmSync(p, { force: true })
    }
  }

  private async executeAgents(context: PhaseContext, payload: PhaseCPayload, config: BootstrapConfig) {
    const tlPrompt = this.buildTechLeadPrompt(payload, config)
    const advPrompt = this.buildAdversarialQAPrompt(payload, config)

    return Promise.all([
      context.invokeAgent({
        skill: 'the-grumpy-tech-lead',
        agent: 'harness-tech-lead',
        mode: 'autonomous',
        prompt: tlPrompt,
        phaseKey: 'phase_c_tl',
      }),
      context.invokeAgent({
        skill: 'adversarial-qa',
        agent: 'harness-qa',
        mode: 'autonomous',
        prompt: advPrompt,
        phaseKey: 'phase_c_adv',
      })
    ])
  }

  private extractScores(context: PhaseContext, domain: string, tlOutput: any, advOutput: any) {
    const specsDir = join(context.workingDir, 'docs', 'specs', domain)

    const tlData = this.parseAgentOutput(join(specsDir, 'TL.json'), tlOutput, 'phase_c_tl')
    const advData = this.parseAgentOutput(join(specsDir, 'QA.json'), advOutput, 'phase_c_adv')

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
   * Logs decisions, manages feature state transitions, and moves to PHASE_D or retries.
   */
  private processDecision(
    context: PhaseContext,
    activeFeature: Feature,
    config: BootstrapConfig,
    result: ValidationResult,
    scores: ValidationScores
  ): Phase {
    // Append verification decision log with scores and rationale
    context.fsm.appendDecision({
      featureId: activeFeature.id,
      decision: `Phase C verdict: ${result.verdict}`,
      scores: { tl: scores.scoreTL, adv: scores.scoreAdv },
      rationale: result.reason,
    })

    // If verification needs rework, transition back to retry handler
    if (result.verdict === 'RETRY') {
      return this.handleRetry(context, activeFeature, scores)
    }

    // Map validation gate verdicts to corresponding bootstrap statuses
    const statusMap: Record<string, typeof config.pendingStatus> = {
      'PASS': 'COMPLETED',
      'BLOCK': 'BLOCKED',
      'FAIL': 'FAILED'
    }

    config.pendingStatus = statusMap[result.verdict] || config.pendingStatus

    // Save final status configuration and update active feature metadata
    context.fsm.saveBootstrapConfig(config)
    context.fsm.updateFeatureStatus(activeFeature.id, 'IN_PROGRESS', { tl: scores.scoreTL, adv: scores.scoreAdv })

    // Proceed to PHASE_D (documentation generation/completion check)
    return Phase.PHASE_D
  }

  private handleRetry(context: PhaseContext, activeFeature: Feature, scores: ValidationScores): Phase {
    context.fsm.incrementReworks(activeFeature.id)
    context.fsm.writeReworkLog(activeFeature.domain, this.buildReworkContent(scores))
    context.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'NOT_STARTED')

    const tddOutputPath = join(context.workingDir, 'docs', 'specs', activeFeature.domain, 'TDD-OUTPUT.json')
    if (existsSync(tddOutputPath)) {
      try {
        rmSync(tddOutputPath, { force: true })
      } catch {
        // ignore
      }
    }
    return Phase.PHASE_B
  }

  private buildReworkContent(scores: ValidationScores): string {
    const sections: string[] = []

    if (scores.openPoints?.length) {
      sections.push(`### Open Points (Tech Lead)\n\n${scores.openPoints.map(p => `- ${p}`).join('\n')}`)
    }

    if (scores.architectureTip) {
      sections.push(`### Architecture Tip\n\n${scores.architectureTip}`)
    }

    if (scores.vulnerabilities?.length) {
      const list = scores.vulnerabilities.map(v => `- [${v.severity ?? 'UNKNOWN'}] ${v.description ?? 'Unspecified'}`).join('\n')
      sections.push(`### Vulnerabilities\n\n${list}`)
    }

    if (scores.edgeCasesMissed?.length) {
      sections.push(`### Edge Cases Missed\n\n${scores.edgeCasesMissed.map(e => `- ${e}`).join('\n')}`)
    }

    return sections.length > 0 ? sections.join('\n\n') : `Score TL: ${scores.scoreTL}, Score Adv: ${scores.scoreAdv}`
  }

  private buildTechLeadPrompt(payload: PhaseCPayload, config: BootstrapConfig): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const threshold = config.scoreThresholds.theGrumpyTechLead.threshold
    const rulesSection = payload.steeringRules?.length
      ? payload.steeringRules.map(r => `- ${r}`).join('\n')
      : '- No additional rules provided'

    return [
      `## Objective`,
      `Review the implementation for feature \`${payload.featureId}\` as a Senior Tech Lead. Identify systemic risks, architectural flaws, and open points using Socratic questioning.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/the-grumpy-tech-lead\` skill before starting.`,
      `You are operating as the \`harness-tech-lead\` agent.`,
      `</skill_context>`,
      ``,
      `<inputs>`,
      ``,
      `<feature>`,
      `Feature ID: ${payload.featureId}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</feature>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<spec_sources>`,
      `- Development log: \`docs/specs/${payload.domain}/TDD-OUTPUT.json\``,
      `- Architecture blueprint: \`docs/specs/${payload.domain}/003-*-tactical-design.md\``,
      `- Read \`docs/README.md\`. You MUST read all files marked as 'Mandatory' or 'Required', and read optional files ONLY IF their context is required for the current task.`,
      `</spec_sources>`,
      ``,
      `<score_threshold>`,
      `scoreThresholdTL = ${threshold}`,
      `score >= ${threshold} → PASS (feature progresses to COMPLETED)`,
      `score <  ${threshold} → RETRY (openPoints logged to REWORK-LOG.md for developer rework)`,
      `</score_threshold>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `</inputs>`,
      ``,
      `<expected_output>`,
      `Respond exclusively with a valid JSON block saved to \`docs/specs/${payload.domain}/TL.json\`:`,
      `\`\`\`json`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "score": 0.00,`,
      `  "isCrashing": false,`,
      `  "openPoints": ["Socratic question 1", "Socratic question 2", "Socratic question 3"],`,
      `  "architectureTip": "Single sentence pointing toward an architectural pattern"`,
      `}`,
      `\`\`\``,
      `</expected_output>`,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- Do not provide ready-made solutions — raise Socratic questions only`,
      `- score must be a float in [0.00, 1.00] rounded to 2 decimals`,
      `- isCrashing: true ONLY if a TIER 1 finding causes application crash or critical break (data loss, downtime, security breach)`,
      `- featureId MUST match: ${payload.featureId}`,
      `</strict_rules>`,
    ].join('\n')
  }

  private buildAdversarialQAPrompt(payload: PhaseCPayload, config: BootstrapConfig): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const threshold = config.scoreThresholds.adversarialQA.threshold
    const rulesSection = payload.steeringRules?.length
      ? payload.steeringRules.map(r => `- ${r}`).join('\n')
      : '- No additional rules provided'

    return [
      `## Objective`,
      `Break the implementation for feature \`${payload.featureId}\` by finding edge cases, boundary faults, and security vulnerabilities that standard TDD missed.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/adversarial-qa\` skill before starting.`,
      `You are operating as the \`harness-qa\` agent.`,
      `</skill_context>`,
      ``,
      `<inputs>`,
      ``,
      `<feature>`,
      `Feature ID: ${payload.featureId}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</feature>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<spec_sources>`,
      `- Development log: \`docs/specs/${payload.domain}/TDD-OUTPUT.json\``,
      `- Test scenarios (acceptance criteria, boundary values, security): \`docs/specs/${payload.domain}/004-*-test-scenarios.md\``,
      `- Problem space (if exists): \`docs/specs/${payload.domain}/001-problem-space.md\``,
      `- Context map (if exists): \`docs/specs/${payload.domain}/002-context-map.md\``,
      `</spec_sources>`,
      ``,
      `<score_threshold>`,
      `scoreThresholdAdv = ${threshold}`,
      `score >= ${threshold} AND no HIGH/CRITICAL vulns → PASS`,
      `score <  ${threshold} OR any HIGH/CRITICAL vuln    → RETRY (forced)`,
      `</score_threshold>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `</inputs>`,
      ``,
      `<expected_output>`,
      `Respond exclusively with a valid JSON block saved to \`docs/specs/${payload.domain}/QA.json\`:`,
      `\`\`\`json`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "score": 0.00,`,
      `  "passedAdversarial": false,`,
      `  "vulnerabilities": [`,
      `    { "type": "SQL_INJECTION|XSS|RACE_CONDITION|AUTH_BYPASS|DATA_EXPOSURE|...", "severity": "LOW|MEDIUM|HIGH|CRITICAL", "description": "Details..." }`,
      `  ],`,
      `  "edgeCasesMissed": ["Description of untested scenario"]`,
      `}`,
      `\`\`\``,
      `</expected_output>`,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- Any HIGH or CRITICAL vulnerability triggers RETRY regardless of score`,
      `- passedAdversarial = true ONLY if score >= ${threshold} AND no HIGH/CRITICAL vulnerabilities`,
      `- score must be a float in [0.00, 1.00] rounded to 2 decimals`,
      `- featureId MUST match: ${payload.featureId}`,
      `</strict_rules>`,
    ].join('\n')
  }
}