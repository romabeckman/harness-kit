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
    _isCrashing?: boolean
  ): VerdictResult {
    const thresholdTL = config.scoreThresholdTL
    const thresholdAdv = config.scoreThresholdAdv
    const maxReworks = config.completionCriteria.maxReworks
    const { scoreTL, scoreAdv, hasHighCriticalVuln, isCrashing } = scores

    const passing = scoreTL >= thresholdTL && scoreAdv >= thresholdAdv && !hasHighCriticalVuln && !isCrashing

    if (passing) {
      return {
        verdict: Verdict.PASS,
        reason: `Scores pass thresholds (TL: ${scoreTL} >= ${thresholdTL}, Adv: ${scoreAdv} >= ${thresholdAdv}) with no high/critical vulnerabilities.`,
      }
    }

    const reasons = this.buildFailureReasons(scores, thresholdTL, thresholdAdv)

    if (reworks < maxReworks) {
      return {
        verdict: Verdict.RETRY,
        reason: `RETRY: ${reasons.join('; ')}. Reworks ${reworks}/${maxReworks} not exhausted.`,
      }
    }

    if (isCrashing) {
      return {
        verdict: Verdict.BLOCK,
        reason: `BLOCK: ${reasons.join('; ')}. Max reworks (${maxReworks}) exhausted, feature is crashing — blocked.`,
      }
    }

    if (scores.hasHighCriticalVuln) {
      return {
        verdict: Verdict.BLOCK,
        reason: `BLOCK: ${reasons.join('; ')}. Max reworks (${maxReworks}) exhausted, unresolved HIGH/CRITICAL vulnerability — blocked.`,
      }
    }

    return {
      verdict: Verdict.FAIL,
      reason: `FAIL: ${reasons.join('; ')}. Max reworks (${maxReworks}) exhausted, non-blocking — feature marked failed.`,
    }
  }

  /**
   * Builds detailed descriptions of why validation failed.
   */
  private static buildFailureReasons(
    scores: ValidationScores,
    thresholdTL: number,
    thresholdAdv: number
  ): string[] {
    const reasons: string[] = []
    const { scoreTL, scoreAdv, hasHighCriticalVuln } = scores

    if (scoreTL < thresholdTL) {
      reasons.push(`TL score ${scoreTL} below threshold ${thresholdTL}`)
    }
    if (scoreAdv < thresholdAdv) {
      reasons.push(`Adv score ${scoreAdv} below threshold ${thresholdAdv}`)
    }
    if (hasHighCriticalVuln) {
      reasons.push('high/critical vulnerability detected')
    }
    if (scores.isCrashing) {
      reasons.push('crashing')
    }
    if (scores.openPoints?.length) {
      reasons.push(`${scores.openPoints.length} open point(s) flagged by tech lead`)
    }
    if (scores.vulnerabilities?.length) {
      reasons.push(`Vulnerabilities: ${scores.vulnerabilities.map(v => v?.description || 'Unspecified').filter(Boolean).join(', ')}`)
    }
    if (scores.edgeCasesMissed?.length) {
      reasons.push(`Edge Cases Missed: ${scores.edgeCasesMissed.join(', ')}`)
    }

    return reasons
  }
}
