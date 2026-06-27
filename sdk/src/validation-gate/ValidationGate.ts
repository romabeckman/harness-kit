import { Verdict } from './types'
import type { ValidationScores, VerdictResult } from './types'
import type { BootstrapConfig } from '../file-state/types'

export class ValidationGate {
  /**
   * Pure function — no I/O, no side effects.
   * isCrashing param mirrors ValidationScores.isCrashing (passed explicitly for clarity).
   */
  static evaluate(
    scores: ValidationScores,
    reworks: number,
    config: BootstrapConfig,
    isCrashing: boolean
  ): VerdictResult {
    const thresholdTL = config.scoreThresholds.theGrumpyTechLead.threshold
    const thresholdAdv = config.scoreThresholds.adversarialQA.threshold
    const maxReworks = config.completionCriteria.maxReworks
    const { scoreTL, scoreAdv, hasHighCriticalVuln } = scores

    const passing = scoreTL >= thresholdTL && scoreAdv >= thresholdAdv && !hasHighCriticalVuln
    const failing = !passing

    if (passing) {
      return {
        verdict: Verdict.PASS,
        reason: `Scores pass thresholds (TL: ${scoreTL} >= ${thresholdTL}, Adv: ${scoreAdv} >= ${thresholdAdv}) with no high/critical vulnerabilities.`,
      }
    }

    if (failing && reworks < maxReworks) {
      const reasons: string[] = []
      if (scoreTL < thresholdTL) reasons.push(`TL score ${scoreTL} below threshold ${thresholdTL}`)
      if (scoreAdv < thresholdAdv) reasons.push(`Adv score ${scoreAdv} below threshold ${thresholdAdv}`)
      if (hasHighCriticalVuln) reasons.push('high/critical vulnerability detected')
      return {
        verdict: Verdict.RETRY,
        reason: `RETRY: ${reasons.join('; ')}. Reworks ${reworks}/${maxReworks} not exhausted.`,
      }
    }

    if (failing && reworks >= maxReworks && isCrashing) {
      const reasons: string[] = []
      if (scoreTL < thresholdTL) reasons.push(`TL score ${scoreTL} below threshold ${thresholdTL}`)
      if (scoreAdv < thresholdAdv) reasons.push(`Adv score ${scoreAdv} below threshold ${thresholdAdv}`)
      if (hasHighCriticalVuln) reasons.push('high/critical vulnerability detected')
      return {
        verdict: Verdict.BLOCK,
        reason: `BLOCK: ${reasons.join('; ')}. Max reworks (${maxReworks}) exhausted, feature is crashing — blocked.`,
      }
    }

    // failing && reworks >= maxReworks && !isCrashing
    const reasons: string[] = []
    if (scoreTL < thresholdTL) reasons.push(`TL score ${scoreTL} below threshold ${thresholdTL}`)
    if (scoreAdv < thresholdAdv) reasons.push(`Adv score ${scoreAdv} below threshold ${thresholdAdv}`)
    if (hasHighCriticalVuln) reasons.push('high/critical vulnerability detected')
    return {
      verdict: Verdict.FAIL,
      reason: `FAIL: ${reasons.join('; ')}. Max reworks (${maxReworks}) exhausted, non-blocking — feature marked failed.`,
    }
  }
}
