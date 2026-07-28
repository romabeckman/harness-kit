import type { BootstrapConfig } from '../types'
import { createDefaultSteeringRules } from '../types'

/**
 * Parses BOOTSTRAP-CONFIG.json into BootstrapConfig.
 * Handles both the minimal shape and the template shape (with extra fields like userProvided).
 */
export class BootstrapConfigParser {
  static parse(json: string): BootstrapConfig {
    const raw = JSON.parse(json)
    const rawMaxReworks = typeof raw.completionCriteria.maxReworks === 'number'
      ? raw.completionCriteria.maxReworks
      : 2
    const rawThresholdTL = typeof raw.scoreThresholdTL === 'number'
      ? raw.scoreThresholdTL
      : (typeof raw.scoreThresholds?.theGrumpyTechLead?.threshold === 'number' ? raw.scoreThresholds.theGrumpyTechLead.threshold : 0.70)
    const rawThresholdAdv = typeof raw.scoreThresholdAdv === 'number'
      ? raw.scoreThresholdAdv
      : (typeof raw.scoreThresholds?.adversarialQA?.threshold === 'number' ? raw.scoreThresholds.adversarialQA.threshold : 0.70)

    const result: import('../types').BootstrapConfig = {
      projectPaths: raw.projectPaths ?? [],
      scoreThresholdTL: Math.min(1, Math.max(0, rawThresholdTL)),
      scoreThresholdAdv: Math.min(1, Math.max(0, rawThresholdAdv)),
      completionCriteria: {
        maxReworks: Math.max(1, rawMaxReworks),  // guard: never allow 0 — would skip all retries
      },
      cycleCounter: {
        completedCycles: raw.cycleCounter.completedCycles,
      },
    }
    if (typeof raw.currentPhase === 'string') {
      result.currentPhase = raw.currentPhase
    }
    if (raw.activeFeatureId !== undefined) {
      result.activeFeatureId = raw.activeFeatureId
    }
    if (Array.isArray(raw.steeringRules)) {
      result.steeringRules = createDefaultSteeringRules()
      if (raw.steeringRules && Array.isArray(raw.steeringRules)) {
        result.steeringRules.user = raw.steeringRules.filter((r: unknown) => typeof r === 'string')
      }
    } else if (raw.steeringRules && typeof raw.steeringRules === 'object') {
      const parseRuleArray = (arr: unknown): string[] => {
        if (Array.isArray(arr)) {
          return arr.filter((r: unknown) => typeof r === 'string')
        }
        return []
      }
      result.steeringRules = {
        user: parseRuleArray(raw.steeringRules.user),
        bootstrap: parseRuleArray(raw.steeringRules.bootstrap),
        planning: parseRuleArray(raw.steeringRules.planning),
        implementation: parseRuleArray(raw.steeringRules.implementation),
        review: parseRuleArray(raw.steeringRules.review),
        memory: parseRuleArray(raw.steeringRules.memory),
      }
    } else {
      result.steeringRules = createDefaultSteeringRules()
    }
    return result
  }
}
