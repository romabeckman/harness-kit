import { existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import { ValidationGate } from '../../validation-gate/ValidationGate'
import type { PhaseCPayload } from '../../context-assembler/types'
import type { BootstrapConfig, Feature, FeatureStatus } from '../../file-state/types'
import type { ValidationScores } from '../../validation-gate/types'

type ValidationResult = ReturnType<typeof ValidationGate.evaluate>;

export class PhaseCHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_C) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) {
      throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)
    }

    this.cleanTemporaryFiles(context, activeFeature.domain)

    const config = context.fsm.loadBootstrapConfig()

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
      config
    )

    return this.processDecision(context, activeFeature, phase, result, scores)
  }

  private cleanTemporaryFiles(context: PhaseContext, domain: string): void {
    const specsDir = join(context.workingDir, 'docs', 'specs', domain)
    for (const file of ['TL.json', 'QA.json']) {
      const p = join(specsDir, file)
      if (existsSync(p)) rmSync(p, { force: true })
    }
  }

  private async executeAgents(context: PhaseContext, payload: PhaseCPayload, config: BootstrapConfig) {
    const tlPrompt = this.buildTechLeadPrompt(payload, context.workingDir)
    const advPrompt = this.buildAdversarialQAPrompt(payload, context.workingDir)

    return Promise.all([
      context.invokeAgent({
        skill: 'the-grumpy-tech-lead',
        agent: 'harness-kit:harness-tech-lead',
        mode: 'autonomous',
        prompt: tlPrompt,
        phaseKey: 'phase_c_tl',
      }),
      context.invokeAgent({
        skill: 'adversarial-qa',
        agent: 'harness-kit:harness-qa',
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
    phase: Phase,
    result: ValidationResult,
    scores: ValidationScores
  ): Phase {
    // Append verification decision log with scores and rationale
    context.fsm.appendDecision({
      featureId: activeFeature.id,
      decision: `${phase} verdict: ${result.verdict}`,
      scores: { tl: scores.scoreTL, adv: scores.scoreAdv },
      rationale: result.reason,
    })

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

    // Proceed to PHASE_D (documentation generation/completion check)
    return Phase.PHASE_D
  }

  private handleRetry(context: PhaseContext, activeFeature: Feature, scores: ValidationScores): Phase {
    context.fsm.incrementReworks(activeFeature.id)
    context.fsm.writeReworkLog(activeFeature.domain, this.buildReworkContent(scores))
    context.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'NOT_STARTED')
    return Phase.PHASE_B
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
      const list = scores.vulnerabilities.map(v => `- [${v.severity ?? 'UNKNOWN'}] ${v.description ?? 'Unspecified'}`).join('\n')
      sections.push(`### Vulnerabilities\n\n${list}`)
    }

    if (scores.edgeCasesMissed?.length) {
      sections.push(`### Edge Cases Missed\n\n${scores.edgeCasesMissed.map(e => `- ${e}`).join('\n')}`)
    }

    return sections.length > 0 ? sections.join('\n\n') : `Score TL: ${scores.scoreTL}, Score Adv: ${scores.scoreAdv}`
  }

  private buildTechLeadPrompt(payload: PhaseCPayload, workingDir: string): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const rulesSection = payload.steeringRules?.length
      ? payload.steeringRules.map(r => `- ${r}`).join('\n')
      : '- No additional rules provided'
    const specsDir = join(workingDir, 'docs', 'specs', payload.domain)
    const reworkLogPath = join(workingDir, 'docs', 'specs', payload.domain, 'REWORK-LOG.md')
    const reworkSection: string[] = []

    if (existsSync(reworkLogPath)) {
      reworkSection.push(
        `<rework_history totalReworks="${payload.totalReworks}">`,
        `Contains a log of previous reviews:`,
        ``,
        `\`\`\`markdown`,
        readFileSync(reworkLogPath, 'utf8').trim(),
        `\`\`\``,
        `</rework_history>`,
        ``,
        `<rework_directive round="${payload.totalReworks}">`,
        `This is rework validation round ${payload.totalReworks}. You MUST:`,
        `1. Read the rework_history above carefully`,
        `2. Check which previous findings have been FIXED in the current code`,
        `3. REMOVE fixed items from your findings — do NOT re-report resolved issues`,
        `4. Only report issues that REMAIN UNFIXED or are NEW`,
        `5. If a previous finding was partially fixed, describe what remains`,
        `6. Your score MUST reflect the CURRENT state of the code after rework, not historical issues`,
        `7. If all previous findings are resolved and no new critical issues exist, score accordingly`,
        `</rework_directive>`,
        ``
      )
    }

    return [
      `## Objective`,
      `Review the implementation for feature \`${payload.featureId}\` as a Senior Tech Lead. Identify systemic risks, architectural flaws, and concrete production failure vectors.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/the-grumpy-tech-lead\` skill before starting.`,
      `</skill_context>`,
      ``,
      `<inputs>`,
      ``,
      ...reworkSection,
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
      `- Development log: \`${specsDir}/TDD-OUTPUT.json\``,
      `- Architecture blueprint: \`${specsDir}/003-*-tactical-design.md\``,
      `- Read \`${workingDir}/docs/README.md\`. You MUST read all files marked as 'Mandatory' or 'Required', and read optional files ONLY IF their context is required for the current task.`,
      `</spec_sources>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `</inputs>`,
      ``,
      `<expected_output>`,
      `Respond exclusively with a valid JSON block saved to \`${specsDir}/TL.json\`:`,
      `\`\`\`json`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "score": 0.00,`,
      `  "isCrashing": false,`,
      `  "openPoints": [`,
      `    "[CRITICAL] <file>:<line> — <direct description of the problem and its impact>",`,
      `    "[HIGH] <file> — <direct description of the problem and its impact>",`,
      `    "[MEDIUM] <area> — <direct description of the problem and its impact>",`,
      `    "[LOW] <area> — <direct description of the problem and its impact>"`,
      `  ],`,
      `  "architectureTip": "Single actionable sentence recommending an architectural improvement"`,
      `}`,
      `\`\`\``,
      `</expected_output>`,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- openPoints MUST be direct, actionable findings — NO questions, NO vague suggestions`,
      `- Each openPoint MUST start with [CRITICAL], [HIGH], [MEDIUM], or [LOW]`,
      `- score must be a float in [0.00, 1.00] rounded to 2 decimals, computed from severity weights`,
      `- isCrashing: true ONLY if a CRITICAL finding causes application crash, data loss, downtime, or security breach`,
      `- featureId MUST match: ${payload.featureId}`,
      `</strict_rules>`,
    ].join('\n')
  }

  private buildAdversarialQAPrompt(payload: PhaseCPayload, workingDir: string): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const rulesSection = payload.steeringRules?.length
      ? payload.steeringRules.map(r => `- ${r}`).join('\n')
      : '- No additional rules provided'
    const specsDir = join(workingDir, 'docs', 'specs', payload.domain)
    const reworkLogPath = join(workingDir, 'docs', 'specs', payload.domain, 'REWORK-LOG.md')
    const reworkSection: string[] = []
    if (existsSync(reworkLogPath)) {
      reworkSection.push(
        `<rework_history totalReworks="${payload.totalReworks}">`,
        `Contains a log of previous reviews:`,
        ``,
        `\`\`\`markdown`,
        readFileSync(reworkLogPath, 'utf8').trim(),
        `\`\`\``,
        `</rework_history>`,
        ``,
        `<rework_directive round="${payload.totalReworks}">`,
        `This is rework validation round ${payload.totalReworks}. You MUST:`,
        `1. Read the rework_history above carefully`,
        `2. Check which previous findings have been FIXED in the current code`,
        `3. REMOVE fixed items from your findings — do NOT re-report resolved issues`,
        `4. Only report issues that REMAIN UNFIXED or are NEW`,
        `5. If a previous finding was partially fixed, describe what remains`,
        `6. Your score MUST reflect the CURRENT state of the code after rework, not historical issues`,
        `7. If all previous findings are resolved and no new critical issues exist, score accordingly`,
        `</rework_directive>`,
        ``
      )
    }

    return [
      `## Objective`,
      `Break the implementation for feature \`${payload.featureId}\` by finding edge cases, boundary faults, and security vulnerabilities that standard TDD missed.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/adversarial-qa\` skill before starting.`,
      `</skill_context>`,
      ``,
      `<inputs>`,
      ``,
      ...reworkSection,
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
      `- Test scenarios (acceptance criteria, boundary values, security): \`${specsDir}/004-*-test-scenarios.md\``,
      `- Architecture contract: \`${specsDir}/003-*-tactical-design.md\``,
      `- Problem space (if exists): \`${specsDir}/001-problem-space.md\``,
      `- Context map (if exists): \`${specsDir}/002-context-map.md\``,
      `</spec_sources>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `</inputs>`,
      ``,
      `<expected_output>`,
      `Respond exclusively with a valid JSON block saved to \`${specsDir}/QA.json\`:`,
      `\`\`\`json`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "score": 0.00,`,
      `  "passedAdversarial": false,`,
      `  "hasHighCriticalVuln": false,`,
      `  "isCrashing": false,`,
      `  "vulnerabilities": [`,
      `    { "type": "SQL_INJECTION|XSS|RACE_CONDITION|AUTH_BYPASS|DATA_EXPOSURE|NULL_DEREF|...", "severity": "LOW|MEDIUM|HIGH|CRITICAL", "description": "Specific location and impact." }`,
      `  ],`,
      `  "edgeCasesMissed": ["Description of untested scenario from 004-*-test-scenarios.md or concrete failure vector"]`,
      `}`,
      `\`\`\``,
      `</expected_output>`,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- Any HIGH or CRITICAL vulnerability triggers RETRY regardless of score`,
      `- score must be a float in [0.00, 1.00] rounded to 2 decimals`,
      `- featureId MUST match: ${payload.featureId}`,
      `</strict_rules>`,
    ].join('\n')
  }
}