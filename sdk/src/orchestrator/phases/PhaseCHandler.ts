import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Complexity, Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import { ValidationGate } from '../../validation-gate/ValidationGate'
import type { PhaseCPayload } from '../../context-assembler/types'
import type { BootstrapConfig, Feature, FeatureStatus } from '../../file-state/types'
import type { ValidationScores } from '../../validation-gate/types'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'

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
    const isSimple = context.config.complexity === Complexity.SIMPLE

    const tlMock = { featureId: payload.featureId, score: 1, isCrashing: false, openPoints: [], architectureTip: '' }
    const specsDir = join(context.workingDir, 'docs', 'specs', payload.domain)

    if (isSimple && existsSync(specsDir)) {
      writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(tlMock, null, 2), 'utf8')
    }

    return Promise.all([
      isSimple
        ? tlMock
        : context.invokeAgent({
          skill: 'harness-kit:the-grumpy-tech-lead',
          agent: 'harness-kit:harness-tech-lead',
          mode: 'autonomous',
          prompt: tlPrompt,
          phaseKey: 'phase_c_tl',
        }),
      context.invokeAgent({
        skill: 'harness-kit:adversarial-qa',
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
    PhaseDecisionLogger.logPhaseC(
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
      const list = scores.vulnerabilities.map(v => `- [ ] FIX: [${v.severity ?? 'UNKNOWN'}] ${v.description ?? 'Unspecified'}`).join('\n')
      sections.push(`### Vulnerabilities\n\n${list}`)
    }
    if (scores.edgeCasesMissed?.length) {
      sections.push(`### Edge Cases Missed\n\n${scores.edgeCasesMissed.map(e => `- [ ] FIX: ${e}`).join('\n')}`)
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
        `Read the file \`${reworkLogPath}\` to know what was fixed in previous rounds.`,
        `</rework_history>`,
        ``,
        `<rework_directive round="${payload.totalReworks}">`,
        `This is rework validation round ${payload.totalReworks}. You MUST:`,
        `1. Read the rework_history above carefully`,
        `2. Check which previous findings have been FIXED in the current code`,
        `3. REMOVE fixed items from your findings   do NOT re-report resolved issues`,
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
      `Review the implementation for feature \`${payload.featureId}\` as a Senior Tech Lead. Your job is to give an HONEST, EVIDENCE-BASED verdict on the code's real state   not to guarantee a certain number of findings per run.`,
      ``,
      `<skill_context>`,
      `Invoke the \`harness-kit:the-grumpy-tech-lead\` skill before starting for clarity and evaluation openPoints.`,
      `</skill_context>`,
      ``,
      `<evaluation_principle>`,
      `Before adding ANY item to openPoints, verify it against all three of these:`,
      `1. Evidence: you can point to an exact file and line (or exact area) in the CURRENT code where the flaw actually exists   not a hypothetical, a "could happen", or a style preference.`,
      `2. Impact: you can state a concrete, reproducible consequence (crash, data loss, security breach, incorrect behavior, maintainability (real maintenance risk), complexity, performance degradation, testability, readability, scalability, extensibility, modularity, coupling, cohesion, error handling, logging, monitoring, observability, memory usage, cpu usage, disk usage, network usage, concurrency, parallelism, distribution, persistence, caching).`,
      `3. Proportional severity: the [CRITICAL]/[HIGH]/[MEDIUM]/[LOW] label matches the actual impact. Do NOT escalate a minor issue to CRITICAL/HIGH just to make the review look thorough or to force a rework cycle.`,
      `Finding zero issues could be a valid and expected outcome when the code genuinely deserves it. You are not being evaluated on how many problems you find   you are being evaluated on accuracy.`,
      `If, after reading the code and specs, nothing meets this bar, return "openPoints": [] and a score that reflects genuinely solid work (e.g. 0.90 1.00). A fabricated or inflated finding is a WORSE outcome than an honest "no issues found", because it triggers an unnecessary rework cycle and wastes effort on a non-problem.`,
      `</evaluation_principle>`,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- openPoints MUST be direct, actionable findings   NO questions, NO vague suggestions, NO speculative "might" or "could" wording`,
      `- Do NOT force a CRITICAL/HIGH finding when none genuinely exists   an empty or low-severity-only openPoints list is expected for solid code`,
      `- Each openPoint MUST start with [CRITICAL], [HIGH], [MEDIUM], or [LOW]`,
      `- score must be a float in [0.00, 1.00] rounded to 2 decimals, computed from severity weights of REAL findings only`,
      `- isCrashing: true ONLY if a CRITICAL finding causes application crash, data loss, downtime, or security breach`,
      `- featureId MUST match: ${payload.featureId}`,
      `</strict_rules>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<spec_sources>`,
      `- Development log: \`${specsDir}/TDD-OUTPUT.json\` or \`git status -s\` to list all modified files in each project.`,
      `- Architecture blueprint: \`${specsDir}/003-*-tactical-design.md\``,
      `- Read \`${workingDir}/docs/README.md\`. You MUST read all files marked as 'Mandatory' or 'Required', and read optional files ONLY IF their context is required for the current task.`,
      `</spec_sources>`,
      ``,
      `<expected_output>`,
      `Respond exclusively with a valid JSON block saved to \`${specsDir}/TL.json\`:`,
      `\`\`\`json`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "score": 0.00,`,
      `  "isCrashing": false,`,
      `  "openPoints": [`,
      `    "[CRITICAL] <file>:<line>   <direct description of the problem and its impact>",`,
      `    "[HIGH] <file>   <direct description of the problem and its impact>",`,
      `    "[MEDIUM] <area>   <direct description of the problem and its impact>",`,
      `    "[LOW] <area>   <direct description of the problem and its impact>"`,
      `  ],`,
      `  "architectureTip": "Single actionable sentence recommending an architectural improvement"`,
      `}`,
      `\`\`\``,
      `Note: openPoints may be an empty array [] when no issue meets the evaluation_principle bar. An empty array with a high score is a fully valid response.`,
      `</expected_output>`,
      ``,
      `<inputs>`,
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
        `Read the file \`${reworkLogPath}\` to know what was fixed in previous rounds.`,
        `</rework_history>`,
        ``,
        `<rework_directive round="${payload.totalReworks}">`,
        `This is rework validation round ${payload.totalReworks}. You MUST:`,
        `1. Read the rework_history above carefully`,
        `2. Check which previous findings have been FIXED in the current code`,
        `3. REMOVE fixed items from your findings   do NOT re-report resolved issues`,
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
      `Attempt to break the implementation for feature \`${payload.featureId}\` by probing edge cases, boundary faults, and security vulnerabilities that standard TDD might miss. Your verdict must reflect what you actually found in the CURRENT code   not a quota of vulnerabilities to report.`,
      ``,
      `<skill_context>`,
      `Invoke the \`harness-kit:adversarial-qa\` skill before starting.`,
      `</skill_context>`,
      ``,
      `<evaluation_principle>`,
      `Before adding ANY item to vulnerabilities or edgeCasesMissed, verify:`,
      `1. Evidence: you can point to the exact file/function/line in the CURRENT code where the flaw exists.`,
      `2. Exploitability / reproducibility: for a vulnerability, you can describe a concrete trigger or exploit path   not a generic "this pattern can sometimes be risky" note. For an edge case, it must be a scenario the code demonstrably fails, not one it merely wasn't explicitly tested against while still behaving correctly.`,
      `3. Proportional severity: LOW/MEDIUM/HIGH/CRITICAL must match real impact. Do NOT inflate severity to force a RETRY.`,
      `Finding zero issues could be a valid and expected outcome when the code genuinely deserves it. You are not being evaluated on how many problems you find   you are being evaluated on accuracy.`,
      `If the implementation genuinely covers the scenarios in the test-scenarios spec and no real vulnerability exists, return "vulnerabilities": [], "edgeCasesMissed": [], "passedAdversarial": true, "hasHighCriticalVuln": false, and a score reflecting that robustness. A fabricated or inflated finding is a WORSE outcome than an honest pass   it triggers an unnecessary rework cycle on a non-problem.`,
      `</evaluation_principle>`,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- Any HIGH or CRITICAL vulnerability triggers RETRY regardless of score   but only report HIGH/CRITICAL when exploitability is demonstrated, not assumed`,
      `- Do NOT force a vulnerability or edge case finding when none genuinely exists   empty arrays with passedAdversarial: true is expected for solid code`,
      `- score must be a float in [0.00, 1.00] rounded to 2 decimals`,
      `- featureId MUST match: ${payload.featureId}`,
      `</strict_rules>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<spec_sources>`,
      `- Development log: \`${specsDir}/TDD-OUTPUT.json\` or \`git status -s\` to list all modified files in each project.`,
      `- Test scenarios (acceptance criteria, boundary values, security): \`${specsDir}/004-*-test-scenarios.md\``,
      `- Architecture contract: \`${specsDir}/003-*-tactical-design.md\``,
      `- Problem space (if exists): \`${specsDir}/001-problem-space.md\``,
      `- Context map (if exists): \`${specsDir}/002-context-map.md\``,
      `</spec_sources>`,
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
      `Note: vulnerabilities and edgeCasesMissed may be empty arrays when nothing meets the evaluation_principle bar. In that case passedAdversarial should be true and hasHighCriticalVuln false.`,
      `</expected_output>`,
      ``,
      `<inputs>`,
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