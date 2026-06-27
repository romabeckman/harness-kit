import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'

export class PhaseEHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_E) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase PHASE_E requires an active feature but none is set`)

    const config = context.fsm.loadBootstrapConfig()
    const decisions = context.fsm.loadRecentDecisions(5)
    const payload = ContextAssembler.buildPhaseEPayload(
      activeFeature,
      config.cycleCounter.completedCycles,
      decisions
    )

    await context.invokeAgent({
      skill: 'project-memory',
      agent: 'developer-backend',
      mode: 'autonomous',
      payload,
    })

    config.cycleCounter.completedCycles += 1
    context.fsm.saveBootstrapConfig(config)
    context.updateState({ completedCycles: config.cycleCounter.completedCycles })

    const nextFeature = features.find(f => f.status === 'NOT_STARTED')
    if (nextFeature) {
      context.updateState({ activeFeatureId: nextFeature.id })
      return Phase.PHASE_A
    }

    return Phase.HALTED
  }
}
