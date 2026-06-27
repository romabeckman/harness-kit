import type { BootstrapConfig } from '../types'

/**
 * Parses BOOTSTRAP-CONFIG.json into BootstrapConfig.
 * Handles both the minimal shape and the template shape (with extra fields like userProvided).
 */
export class BootstrapConfigParser {
  static parse(json: string): BootstrapConfig {
    const raw = JSON.parse(json)
    const result: import('../types').BootstrapConfig = {
      scoreThresholds: {
        theGrumpyTechLead: { threshold: raw.scoreThresholds.theGrumpyTechLead.threshold },
        adversarialQA: { threshold: raw.scoreThresholds.adversarialQA.threshold },
      },
      completionCriteria: {
        maxReworks: raw.completionCriteria.maxReworks,
      },
      cycleCounter: {
        completedCycles: raw.cycleCounter.completedCycles,
      },
    }
    if (typeof raw.currentPhase === 'string') {
      result.currentPhase = raw.currentPhase
    }
    return result
  }
}
