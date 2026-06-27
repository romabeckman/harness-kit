import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'

export class PhaseDHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_D) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const completed = features.filter(f => f.status === 'COMPLETED').length
    context.fsm.appendDecision({
      featureId: null,
      decision: `Phase D: completion check — ${completed}/${features.length} features completed.`,
    })
    return Phase.PHASE_E
  }
}
