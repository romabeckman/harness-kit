import { existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import { ValidationGate } from '../../validation-gate/ValidationGate'

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
    const tlOutput = await context.invokeAgent({
      skill: 'the-grumpy-tech-lead',
      agent: 'harness-code-reviewer',
      mode: 'autonomous',
      payload: payloadC,
      phaseKey: 'phase_c_tl',
    })

    const advOutput = await context.invokeAgent({
      skill: 'adversarial-qa',
      agent: 'harness-qa',
      mode: 'autonomous',
      payload: payloadC,
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
}
