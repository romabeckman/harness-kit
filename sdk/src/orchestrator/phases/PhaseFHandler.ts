import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'

export class PhaseFHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_F) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) {
      throw new Error(`Illegal state: phase PHASE_F requires an active feature but none is set`)
    }

    const config = context.fsm.loadBootstrapConfig()
    const pendingStatus = config.pendingStatus ?? (
      ['COMPLETED', 'BLOCKED', 'FAILED'].includes(activeFeature.status)
        ? activeFeature.status
        : null
    )

    if (!pendingStatus) {
      throw new Error(`Illegal state: phase PHASE_F requires pendingStatus in config or terminal active feature status but none is set`)
    }

    // Mark the feature status with the pending status (and retain the scores)
    const scores = activeFeature.scoreTL !== null && activeFeature.scoreAdv !== null
      ? { tl: activeFeature.scoreTL, adv: activeFeature.scoreAdv }
      : undefined

    context.fsm.updateFeatureStatus(activeFeature.id, pendingStatus, scores)

    // Increment completed cycles
    config.cycleCounter.completedCycles += 1
    delete config.pendingStatus
    context.fsm.saveBootstrapConfig(config)
    context.updateState({ completedCycles: config.cycleCounter.completedCycles })

    // Find next feature (NOT_STARTED)
    const updatedFeatures = context.fsm.loadBacklog()
    const nextFeature = updatedFeatures.find(f => f.status === 'NOT_STARTED')

    if (context.onFeatureTransition) {
      const updatedActiveFeature = updatedFeatures.find(f => f.id === activeFeature.id) ?? activeFeature
      context.onFeatureTransition(updatedActiveFeature, nextFeature ?? null, config.cycleCounter.completedCycles)
    }

    if (nextFeature) {
      context.updateState({ activeFeatureId: nextFeature.id })
      return Phase.PHASE_A
    }

    // Clear activeFeatureId since we are halting and no features remain
    context.updateState({ activeFeatureId: null })
    const finalConfig = context.fsm.loadBootstrapConfig()
    finalConfig.activeFeatureId = null
    context.fsm.saveBootstrapConfig(finalConfig)

    return Phase.HALTED
  }
}
