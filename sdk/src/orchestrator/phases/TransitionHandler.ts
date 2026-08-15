import { Feature } from '../../file-state/types'
import { Phase } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'
import { clearFeatureDeveloperSessions } from '../utils/SessionHelpers'

export class TransitionHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.TRANSITION) {
      return super.handle(phase, context)
    }

    clearFeatureDeveloperSessions(context)

    const features = context.fsm.loadBacklog()
    const config = context.fsm.loadBootstrapConfig()

    // --- State Check Logic ---
    const maxReworks = config.completionCriteria.maxReworks
    const thresholdTL = config.scoreThresholdTL
    const thresholdAdv = config.scoreThresholdAdv
    const violations: string[] = []

    for (const f of features) {
      if (f.status === 'COMPLETED') {
        if (f.scoreTL !== null && f.scoreTL < thresholdTL) {
          violations.push(`${f.id}: scoreTL ${f.scoreTL} < threshold ${thresholdTL}`)
        }
        if (f.scoreAdv !== null && f.scoreAdv < thresholdAdv) {
          violations.push(`${f.id}: scoreAdv ${f.scoreAdv} < threshold ${thresholdAdv}`)
        }
      }
      if ((f.status === 'BLOCKED' || f.status === 'FAILED') && f.reworks < maxReworks) {
        violations.push(`${f.id}: status ${f.status} but reworks ${f.reworks} < maxReworks ${maxReworks}`)
      }
    }

    const completed = features.filter(f => f.status === 'COMPLETED').length
    const decision = violations.length > 0
      ? `TRANSITION (state check): ${completed}/${features.length} completed. Violations: ${violations.join('; ')}`
      : `TRANSITION (state check): ${completed}/${features.length} features completed.`

    context.fsm.appendDecision({ featureId: null, decision })
    // --------------------------

    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) {
      return this.retryableFeatures(features, context, phase)
    }

    const pendingStatus = activeFeature.status ?? (
      ['COMPLETED', 'BLOCKED', 'FAILED'].includes(activeFeature.status)
        ? activeFeature.status
        : null
    )

    if (!pendingStatus) {
      throw new Error(`Illegal state: phase ${phase} requires pendingStatus in config or terminal active feature status but none is set`)
    }

    // Cascade block: only BLOCKED propagates to transitive dependents
    // FAILED is non-critical — dependents remain NOT_STARTED and can proceed
    if (pendingStatus === 'BLOCKED') {
      const cascadedIds = context.fsm.blockDependents(activeFeature.id, features)
      if (cascadedIds.length > 0) {
        context.fsm.appendDecision({
          featureId: activeFeature.id,
          decision: `${phase} cascade: ${activeFeature.id} BLOCKED → dependents also blocked: ${cascadedIds.join(', ')}`,
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
      return Phase.PLANNING
    }

    this.clearActiveFeatureTasks(context)
    return Phase.MEMORY
  }

  private retryableFeatures(features: Feature[], context: Reviewontext, phase: Phase) {
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
        decision: `Phase ${phase} unblock-retry (reentry): reset BLOCKED → NOT_STARTED (reworks zeroed) for [${retryIds}] (maxReworks=${maxReworks})`,
      })

      config.activeFeatureId = retryable[0].id
      context.fsm.saveBootstrapConfig(config)
      return Phase.DEVELOPMENT
    }
    throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)
  }

  private clearActiveFeatureTasks(context: Reviewontext): void {
    const finalConfig = context.fsm.loadBootstrapConfig()
    delete finalConfig.activeFeatureId
    context.fsm.saveBootstrapConfig(finalConfig)
  }
}
