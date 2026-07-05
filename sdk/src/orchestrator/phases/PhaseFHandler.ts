import { Feature } from '../../file-state/types'
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
      return this.retryableFeatures(features, context)
    }

    const config = context.fsm.loadBootstrapConfig()
    const pendingStatus = activeFeature.status ?? (
      ['COMPLETED', 'BLOCKED', 'FAILED'].includes(activeFeature.status)
        ? activeFeature.status
        : null
    )

    if (!pendingStatus) {
      throw new Error(`Illegal state: phase PHASE_F requires pendingStatus in config or terminal active feature status but none is set`)
    }

    // Cascade block: only BLOCKED propagates to transitive dependents
    // FAILED is non-critical — dependents remain NOT_STARTED and can proceed
    if (pendingStatus === 'BLOCKED') {
      const cascadedIds = context.fsm.blockDependents(activeFeature.id, features)
      if (cascadedIds.length > 0) {
        context.fsm.appendDecision({
          featureId: activeFeature.id,
          decision: `Phase F cascade: ${activeFeature.id} BLOCKED → dependents also blocked: ${cascadedIds.join(', ')}`,
        })
      }
    }

    // Increment completed cycles
    config.cycleCounter.completedCycles += 1
    context.fsm.saveBootstrapConfig(config)

    // Find next feature (NOT_STARTED) — reload after cascade to get fresh state
    const updatedFeatures = context.fsm.loadBacklog()
    const nextFeature = updatedFeatures.find(f => f.status === 'NOT_STARTED')

    if (context.onFeatureTransition) {
      const updatedActiveFeature = updatedFeatures.find(f => f.id === activeFeature.id) ?? activeFeature
      context.onFeatureTransition(updatedActiveFeature, nextFeature ?? null, config.cycleCounter.completedCycles)
    }

    if (nextFeature) {
      config.activeFeatureId = nextFeature.id
      context.fsm.saveBootstrapConfig(config)
      return Phase.PHASE_A
    }

    this.clearActiveFeatureTasks(context)
    return Phase.HALTED
  }

  private retryableFeatures(features: Feature[], context: PhaseContext) {
    const config = context.fsm.loadBootstrapConfig()
    const maxReworks = config.completionCriteria.maxReworks
    const retryable = features.filter(f => f.status === 'BLOCKED')

    if (retryable.length > 0) {
      for (const f of retryable) {
        context.fsm.updateFeatureStatus(f.id, 'NOT_STARTED')
        context.fsm.updateAllFeatureTasks(f.id, '-', 'NOT_STARTED')
        context.fsm.resetReworks(f.id)
      }
      const retryIds = retryable.map(f => f.id).join(', ')
      context.fsm.appendDecision({
        featureId: null,
        decision: `Phase F unblock-retry (reentry): reset BLOCKED → NOT_STARTED (reworks zeroed) for [${retryIds}] (maxReworks=${maxReworks})`,
      })

      config.activeFeatureId = retryable[0].id
      context.fsm.saveBootstrapConfig(config)
      return Phase.PHASE_B
    }
    throw new Error(`Illegal state: phase PHASE_F requires an active feature but none is set`)
  }

  private clearActiveFeatureTasks(context: PhaseContext): void {
    const finalConfig = context.fsm.loadBootstrapConfig()
    delete finalConfig.activeFeatureId
    context.fsm.saveBootstrapConfig(finalConfig)
  }
}
