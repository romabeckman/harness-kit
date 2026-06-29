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
      decisions,
      config.steeringRules
    )

    await context.invokeAgent({
      skill: 'project-memory',
      agent: 'developer-backend',
      mode: 'autonomous',
      payload,
      phaseKey: 'phase_e',
    })

    return Phase.PHASE_F
  }
}
