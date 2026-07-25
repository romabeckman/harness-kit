import { describe, it, expect } from 'vitest'
import { ValidationGate } from '../ValidationGate'
import { Verdict } from '../types'
import type { ValidationScores } from '../types'
import type { BootstrapConfig } from '../../file-state/types'

function makeConfig(maxReworks = 3, thresholdTL = 0.85, thresholdAdv = 0.85): BootstrapConfig {
  return {
    projectPaths: [],
    scoreThresholdTL: thresholdTL,
    scoreThresholdAdv: thresholdAdv,
    completionCriteria: { maxReworks },
    cycleCounter: { completedCycles: 0 },
  }
}

function makeScores(overrides: Partial<ValidationScores> = {}): ValidationScores {
  return {
    scoreTL: 0.9,
    scoreAdv: 0.9,
    hasHighCriticalVuln: false,
    isCrashing: false,
    ...overrides,
  }
}

describe('ValidationGate.evaluate', () => {
  describe('PASS verdict', () => {
    it('returns PASS when both scores meet thresholds and no high/critical vuln', () => {
      const result = ValidationGate.evaluate(makeScores(), 0, makeConfig(), false)
      expect(result.verdict).toBe(Verdict.PASS)
      expect(result.reason).toContain('TL:')
      expect(result.reason).toContain('Adv:')
    })

    it('returns PASS when scores exactly equal thresholds', () => {
      const result = ValidationGate.evaluate(makeScores({ scoreTL: 0.85, scoreAdv: 0.85 }), 0, makeConfig(), false)
      expect(result.verdict).toBe(Verdict.PASS)
    })

    it('returns RETRY (not PASS) when hasHighCriticalVuln is true even with good scores', () => {
      const result = ValidationGate.evaluate(
        makeScores({ scoreTL: 1.0, scoreAdv: 1.0, hasHighCriticalVuln: true }),
        0,
        makeConfig(),
        false
      )
      expect(result.verdict).toBe(Verdict.RETRY)
    })
  })

  describe('RETRY verdict', () => {
    it('returns RETRY when scoreTL is below threshold and reworks not exhausted', () => {
      const result = ValidationGate.evaluate(
        makeScores({ scoreTL: 0.5 }),
        1,
        makeConfig(3),
        false
      )
      expect(result.verdict).toBe(Verdict.RETRY)
      expect(result.reason).toContain('RETRY')
      expect(result.reason).toContain('1/3')
    })

    it('returns RETRY when scoreAdv is below threshold and reworks not exhausted', () => {
      const result = ValidationGate.evaluate(
        makeScores({ scoreAdv: 0.3 }),
        0,
        makeConfig(3),
        false
      )
      expect(result.verdict).toBe(Verdict.RETRY)
    })
  })

  describe('BLOCK verdict', () => {
    it('returns BLOCK when reworks exhausted and isCrashing is true', () => {
      const result = ValidationGate.evaluate(
        makeScores({ scoreTL: 0.5, isCrashing: true }),
        3,
        makeConfig(3)
      )
      expect(result.verdict).toBe(Verdict.BLOCK)
      expect(result.reason).toContain('BLOCK')
      expect(result.reason).toContain('crashing')
    })
  })

  describe('FAIL verdict', () => {
    it('returns FAIL when reworks exhausted and isCrashing is false', () => {
      const result = ValidationGate.evaluate(
        makeScores({ scoreTL: 0.5, isCrashing: false }),
        3,
        makeConfig(3)
      )
      expect(result.verdict).toBe(Verdict.FAIL)
      expect(result.reason).toContain('FAIL')
    })
  })

  describe('buildFailureReasons — uncovered branches', () => {
    it('includes openPoints count in failure reason when present', () => {
      const result = ValidationGate.evaluate(
        makeScores({ scoreTL: 0.5, openPoints: ['Missing error handler', 'No retry logic'] }),
        0,
        makeConfig(3),
        false
      )
      expect(result.reason).toContain('open point(s) flagged by tech lead')
      expect(result.reason).toContain('2')
    })

    it('includes hasHighCriticalVuln description in failure reason', () => {
      const result = ValidationGate.evaluate(
        makeScores({ scoreTL: 0.5, hasHighCriticalVuln: true }),
        0,
        makeConfig(3),
        false
      )
      expect(result.reason).toContain('high/critical vulnerability')
    })

    it('includes vulnerabilities in failure reason with description', () => {
      const result = ValidationGate.evaluate(
        makeScores({
          scoreTL: 0.5,
          vulnerabilities: [
            { type: 'SQL_INJECTION', severity: 'HIGH', description: 'Unsanitized query input' },
          ]
        }),
        0,
        makeConfig(3),
        false
      )
      expect(result.reason).toContain('Vulnerabilities')
      expect(result.reason).toContain('Unsanitized query input')
    })

    it('handles vulnerability entries with no description gracefully', () => {
      const result = ValidationGate.evaluate(
        makeScores({
          scoreTL: 0.5,
          vulnerabilities: [{ type: 'XSS', severity: 'HIGH' }]
        }),
        0,
        makeConfig(3),
        false
      )
      expect(result.reason).toContain('Vulnerabilities')
      expect(result.verdict).toBe(Verdict.RETRY)
    })

    it('includes edgeCasesMissed in failure reason', () => {
      const result = ValidationGate.evaluate(
        makeScores({ scoreTL: 0.5, edgeCasesMissed: ['Empty array input', 'Negative values'] }),
        0,
        makeConfig(3),
        false
      )
      expect(result.reason).toContain('Edge Cases Missed')
      expect(result.reason).toContain('Empty array input')
    })

    it('includes all failure reasons when multiple conditions fail simultaneously', () => {
      const result = ValidationGate.evaluate(
        makeScores({
          scoreTL: 0.4,
          scoreAdv: 0.3,
          hasHighCriticalVuln: true,
          openPoints: ['Needs auth check'],
          edgeCasesMissed: ['NULL input'],
          vulnerabilities: [{ description: 'XSS in search' }],
        }),
        0,
        makeConfig(3),
        false
      )
      expect(result.reason).toContain('TL score')
      expect(result.reason).toContain('Adv score')
      expect(result.reason).toContain('high/critical vulnerability')
      expect(result.reason).toContain('open point(s) flagged by tech lead')
      expect(result.reason).toContain('Edge Cases Missed')
      expect(result.reason).toContain('Vulnerabilities')
    })

    it('does NOT include TL score reason when only scoreAdv fails', () => {
      const result = ValidationGate.evaluate(
        makeScores({ scoreTL: 0.95, scoreAdv: 0.3 }),
        0,
        makeConfig(3),
        false
      )
      expect(result.reason).not.toContain('TL score')
      expect(result.reason).toContain('Adv score')
    })
  })
})
