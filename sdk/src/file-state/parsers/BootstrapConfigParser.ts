import type { BootstrapConfig } from '../types'

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
    const rawThresholdTL = typeof raw.scoreThresholds.theGrumpyTechLead.threshold === 'number'
      ? raw.scoreThresholds.theGrumpyTechLead.threshold
      : 0.70
    const rawThresholdAdv = typeof raw.scoreThresholds.adversarialQA.threshold === 'number'
      ? raw.scoreThresholds.adversarialQA.threshold
      : 0.70

    const result: import('../types').BootstrapConfig = {
      scoreThresholds: {
        theGrumpyTechLead: { threshold: Math.min(1, Math.max(0, rawThresholdTL)) },
        adversarialQA: { threshold: Math.min(1, Math.max(0, rawThresholdAdv)) },
      },
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
    if (typeof raw.originalScope === 'string') {
      result.originalScope = raw.originalScope
    }
    if (Array.isArray(raw.steeringRules)) {
      result.steeringRules = raw.steeringRules.filter((r: unknown) => typeof r === 'string')
    } else {
      result.steeringRules = []
    }
    return result
  }
}
