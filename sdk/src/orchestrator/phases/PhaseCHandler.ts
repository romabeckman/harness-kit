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

    const config = context.fsm.loadBootstrapConfig()

    const payloadC = ContextAssembler.buildPhaseCPayload(activeFeature, context.config.projectPaths, config.steeringRules)
    const tlOutput = await context.invokeAgent({
      skill: 'the-grumpy-tech-lead',
      agent: 'harness-code-reviewer',
      mode: 'autonomous',
      payload: payloadC,
    })

    const advOutput = await context.invokeAgent({
      skill: 'adversarial-qa',
      agent: 'harness-qa',
      mode: 'autonomous',
      payload: payloadC,
    })

    const tlExtraction = JsonExtractionProtocol.extract(tlOutput.raw)
    const advExtraction = JsonExtractionProtocol.extract(advOutput.raw)

    let scoreTL = 0
    let scoreAdv = 0
    let hasHighCriticalVuln = false
    let isCrashing = false

    if (isExtractionResult(tlExtraction)) {
      const data = tlExtraction.data as Record<string, unknown>
      scoreTL = typeof data['scoreTL'] === 'number' ? data['scoreTL'] :
        typeof data['score'] === 'number' ? data['score'] : 0
    }

    if (isExtractionResult(advExtraction)) {
      const data = advExtraction.data as Record<string, unknown>
      scoreAdv = typeof data['scoreAdv'] === 'number' ? data['scoreAdv'] :
        typeof data['score'] === 'number' ? data['score'] : 0
      hasHighCriticalVuln = data['hasHighCriticalVuln'] === true
      isCrashing = data['isCrashing'] === true
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
        context.fsm.updateFeatureStatus(activeFeature.id, 'COMPLETED', { tl: scoreTL, adv: scoreAdv })
        return Phase.PHASE_D

      case 'RETRY':
        context.fsm.incrementReworks(activeFeature.id)
        context.fsm.writeReworkLog(activeFeature.domain, result.reason)
        context.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'NOT_STARTED')
        return Phase.PHASE_B

      case 'BLOCK':
        context.fsm.updateFeatureStatus(activeFeature.id, 'BLOCKED', { tl: scoreTL, adv: scoreAdv })
        return Phase.PHASE_D

      case 'FAIL':
        context.fsm.updateFeatureStatus(activeFeature.id, 'FAILED', { tl: scoreTL, adv: scoreAdv })
        return Phase.PHASE_D

      default:
        return Phase.PHASE_D
    }
  }
}
