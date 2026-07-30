import { Phase } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'

export class CascadeBlockedHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.CASCADE_BLOCKED) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)

    context.fsm.updateFeatureStatus(activeFeature.id, 'BLOCKED')

    context.fsm.appendDecision({
      featureId: activeFeature.id,
      decision: `Cascade block: blocked because dependency is BLOCKED.`,
    })
    return Phase.TRANSITION
  }
}
