import { existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import { ValidationGate } from '../../validation-gate/ValidationGate'
import type { PhaseCPayload } from '../../context-assembler/types'
import type { BootstrapConfig } from '../../file-state/types'

export class PhaseCHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_C) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase PHASE_C requires an active feature but none is set`)

    const tempJsonlPath = join(context.workingDir, 'docs', 'specs', activeFeature.domain, 'TDD-OUTPUT-TEMP.jsonl')
    if (existsSync(tempJsonlPath)) {
      rmSync(tempJsonlPath)
    }

    const config = context.fsm.loadBootstrapConfig()

    const payloadC = ContextAssembler.buildPhaseCPayload(activeFeature, context.config.projectPaths, config.steeringRules)
    const tlPrompt = this.buildTechLeadPrompt(payloadC, config)
    const advPrompt = this.buildAdversarialQAPrompt(payloadC, config)

    const tlOutput = await context.invokeAgent({
      skill: 'the-grumpy-tech-lead',
      agent: 'harness-code-reviewer',
      mode: 'autonomous',
      prompt: tlPrompt,
      phaseKey: 'phase_c_tl',
    })

    const advOutput = await context.invokeAgent({
      skill: 'adversarial-qa',
      agent: 'harness-qa',
      mode: 'autonomous',
      prompt: advPrompt,
      phaseKey: 'phase_c_adv',
    })

    // Prefer files docs/specs/${domain}/TL.json and docs/specs/${domain}/QA.json if they exist.
    // Otherwise, fall back to runner-extracted/raw output.
    const specsDir = join(context.workingDir, 'docs', 'specs', activeFeature.domain)
    const tlJsonPath = join(specsDir, 'TL.json')
    const qaJsonPath = join(specsDir, 'QA.json')

    let tlExtraction: any
    let advExtraction: any

    if (existsSync(tlJsonPath)) {
      try {
        const content = readFileSync(tlJsonPath, 'utf8')
        tlExtraction = { data: JSON.parse(content) }
      } catch (err: any) {
        process.stderr.write(`[phase_c_tl] Failed to parse TL.json: ${err.message}\n`)
        tlExtraction = tlOutput.artefacts && Object.keys(tlOutput.artefacts).length > 0
          ? { data: tlOutput.artefacts }
          : JsonExtractionProtocol.extract(tlOutput.raw)
      }
    } else {
      tlExtraction = tlOutput.artefacts && Object.keys(tlOutput.artefacts).length > 0
        ? { data: tlOutput.artefacts }
        : JsonExtractionProtocol.extract(tlOutput.raw)
    }

    if (existsSync(qaJsonPath)) {
      try {
        const content = readFileSync(qaJsonPath, 'utf8')
        advExtraction = { data: JSON.parse(content) }
      } catch (err: any) {
        process.stderr.write(`[phase_c_adv] Failed to parse QA.json: ${err.message}\n`)
        advExtraction = advOutput.artefacts && Object.keys(advOutput.artefacts).length > 0
          ? { data: advOutput.artefacts }
          : JsonExtractionProtocol.extract(advOutput.raw)
      }
    } else {
      advExtraction = advOutput.artefacts && Object.keys(advOutput.artefacts).length > 0
        ? { data: advOutput.artefacts }
        : JsonExtractionProtocol.extract(advOutput.raw)
    }

    let scoreTL = 0
    let scoreAdv = 0
    let hasHighCriticalVuln = false
    let isCrashing = false

    if (isExtractionResult(tlExtraction)) {
      const data = tlExtraction.data as Record<string, unknown>
      scoreTL = typeof data['scoreTL'] === 'number' ? data['scoreTL'] :
        typeof data['score'] === 'number' ? data['score'] : 0
    } else {
      process.stderr.write(`[phase_c_tl] JSON extraction failed: ${tlExtraction.error}\nRaw output (first 500 chars): ${tlOutput.raw.slice(0, 500)}\n`)
    }

    if (isExtractionResult(advExtraction)) {
      const data = advExtraction.data as Record<string, unknown>
      scoreAdv = typeof data['scoreAdv'] === 'number' ? data['scoreAdv'] :
        typeof data['score'] === 'number' ? data['score'] : 0
      hasHighCriticalVuln = data['hasHighCriticalVuln'] === true
      isCrashing = data['isCrashing'] === true
    } else {
      process.stderr.write(`[phase_c_adv] JSON extraction failed: ${advExtraction.error}\nRaw output (first 500 chars): ${advOutput.raw.slice(0, 500)}\n`)
    }

    const result = ValidationGate.evaluate(
      { scoreTL, scoreAdv, hasHighCriticalVuln, isCrashing },
      activeFeature.reworks,
      config,
      isCrashing
    )

    context.fsm.appendDecision({
      featureId: activeFeature.id,
      decision: `Phase C verdict: ${result.verdict}`,
      scores: { tl: scoreTL, adv: scoreAdv },
      rationale: result.reason,
    })

    switch (result.verdict) {
      case 'PASS':
        config.pendingStatus = 'COMPLETED'
        context.fsm.saveBootstrapConfig(config)
        context.fsm.updateFeatureStatus(activeFeature.id, 'IN_PROGRESS', { tl: scoreTL, adv: scoreAdv })
        return Phase.PHASE_D

      case 'RETRY':
        context.fsm.incrementReworks(activeFeature.id)
        context.fsm.writeReworkLog(activeFeature.domain, result.reason)
        context.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'NOT_STARTED')
        
        // Invalidate TDD-OUTPUT.json artifact to prevent infinite loop on re-entry to Phase B
        const tddOutputPath = join(context.workingDir, 'docs', 'specs', activeFeature.domain, 'TDD-OUTPUT.json')
        if (existsSync(tddOutputPath)) {
          try {
            rmSync(tddOutputPath, { force: true })
          } catch {
            // ignore
          }
        }
        return Phase.PHASE_B

      case 'BLOCK':
        config.pendingStatus = 'BLOCKED'
        context.fsm.saveBootstrapConfig(config)
        context.fsm.updateFeatureStatus(activeFeature.id, 'IN_PROGRESS', { tl: scoreTL, adv: scoreAdv })
        return Phase.PHASE_D

      case 'FAIL':
        config.pendingStatus = 'FAILED'
        context.fsm.saveBootstrapConfig(config)
        context.fsm.updateFeatureStatus(activeFeature.id, 'IN_PROGRESS', { tl: scoreTL, adv: scoreAdv })
        return Phase.PHASE_D

      default:
        return Phase.PHASE_D
    }
  }

  private buildTechLeadPrompt(payload: PhaseCPayload, config: BootstrapConfig): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const threshold = config.scoreThresholds.theGrumpyTechLead.threshold
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
        ? payload.steeringRules.map(r => `- ${r}`).join('\n')
        : '- No additional rules provided'

    return [
      `## Objective`,
      `Review the implementation for feature \`${payload.featureId}\` as a Senior Tech Lead. Identify systemic risks, architectural flaws, and open points using Socratic questioning.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/the-grumpy-tech-lead\` skill before starting.`,
      `You are operating as the \`harness-code-reviewer\` agent.`,
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
      `- Architecture blueprint: \`docs/specs/${payload.domain}/003-*-tactical-design.md\``,
      `- Architecture decisions: \`docs/adr/ARCHITECTURE.md\``,
      `- Test strategy: \`docs/adr/TESTS.md\``,
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
      `- featureId MUST match: ${payload.featureId}`,
      `</strict_rules>`,
    ].join('\n')
  }

  private buildAdversarialQAPrompt(payload: PhaseCPayload, config: BootstrapConfig): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const threshold = config.scoreThresholds.adversarialQA.threshold
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
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
      `- Problem space: \`docs/specs/${payload.domain}/001-problem-space.md\``,
      `- Context map: \`docs/specs/${payload.domain}/002-context-map.md\``,
      `- Test scenarios (acceptance criteria, boundary values, security): \`docs/specs/${payload.domain}/004-*-test-scenarios.md\``,
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
