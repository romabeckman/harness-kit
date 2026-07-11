import { describe, it, expect } from 'vitest'
import { ValidationGate } from '../../src/validation-gate/ValidationGate'
import { Verdict } from '../../src/validation-gate/types'
import type { BootstrapConfig } from '../../src/file-state/types'

const defaultConfig: BootstrapConfig = {
  scoreThresholdTL: 0.70,
  scoreThresholdAdv: 0.70,
  completionCriteria: { maxReworks: 2 },
  cycleCounter: { completedCycles: 0 },
}

describe('T05 — ValidationGate', () => {
  describe('TS-U-18: PASS — both scores above threshold, no vulnerability', () => {
    it('returns PASS when scoreTL=0.80, scoreAdv=0.75, no vuln', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.80, scoreAdv: 0.75, hasHighCriticalVuln: false, isCrashing: false },
        0,
        defaultConfig,
        false
      )
      expect(result.verdict).toBe(Verdict.PASS)
    })
  })

  describe('TS-U-19: PASS — scores exactly at threshold boundary', () => {
    it('returns PASS when scoreTL=0.70, scoreAdv=0.70 (inclusive boundary)', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.70, scoreAdv: 0.70, hasHighCriticalVuln: false, isCrashing: false },
        0,
        defaultConfig,
        false
      )
      expect(result.verdict).toBe(Verdict.PASS)
    })
  })

  describe('TS-U-20: RETRY — TL score below threshold, reworks not exhausted', () => {
    it('returns RETRY when scoreTL=0.60, reworks=1, maxReworks=2', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.60, scoreAdv: 0.80, hasHighCriticalVuln: false, isCrashing: false },
        1,
        defaultConfig,
        false
      )
      expect(result.verdict).toBe(Verdict.RETRY)
    })
  })

  describe('TS-U-21: RETRY — Adv score below threshold, reworks not exhausted', () => {
    it('returns RETRY when scoreAdv=0.60, reworks=0, maxReworks=2', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.80, scoreAdv: 0.60, hasHighCriticalVuln: false, isCrashing: false },
        0,
        defaultConfig,
        false
      )
      expect(result.verdict).toBe(Verdict.RETRY)
    })
  })

  describe('TS-U-22: RETRY — high/critical vuln present, reworks not exhausted', () => {
    it('returns RETRY when hasHighCriticalVuln=true, reworks=0', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.80, scoreAdv: 0.80, hasHighCriticalVuln: true, isCrashing: false },
        0,
        defaultConfig,
        false
      )
      expect(result.verdict).toBe(Verdict.RETRY)
    })
  })

  describe('TS-U-23: BLOCK — score below threshold, reworks exhausted, isCrashing=true', () => {
    it('returns BLOCK when scoreTL=0.50, reworks=2, maxReworks=2, isCrashing=true', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.50, scoreAdv: 0.80, hasHighCriticalVuln: false, isCrashing: true },
        2,
        defaultConfig,
        true
      )
      expect(result.verdict).toBe(Verdict.BLOCK)
    })
  })

  describe('TS-U-24: FAIL — score below threshold, reworks exhausted, isCrashing=false', () => {
    it('returns FAIL when scoreTL=0.50, reworks=2, maxReworks=2, isCrashing=false', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.50, scoreAdv: 0.80, hasHighCriticalVuln: false, isCrashing: false },
        2,
        defaultConfig,
        false
      )
      expect(result.verdict).toBe(Verdict.FAIL)
    })
  })

  describe('TS-U-25: BLOCK — vuln, reworks exhausted, isCrashing=true', () => {
    it('returns BLOCK when hasHighCriticalVuln=true, reworks=2, isCrashing=true', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.80, scoreAdv: 0.80, hasHighCriticalVuln: true, isCrashing: true },
        2,
        defaultConfig,
        true
      )
      expect(result.verdict).toBe(Verdict.BLOCK)
    })
  })

  describe('TS-U-26: VerdictResult includes non-empty reason', () => {
    it('reason is non-empty string for PASS', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.80, scoreAdv: 0.80, hasHighCriticalVuln: false, isCrashing: false },
        0,
        defaultConfig,
        false
      )
      expect(typeof result.reason).toBe('string')
      expect(result.reason.length).toBeGreaterThan(0)
    })

    it('reason is non-empty string for RETRY', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.50, scoreAdv: 0.80, hasHighCriticalVuln: false, isCrashing: false },
        0,
        defaultConfig,
        false
      )
      expect(result.reason.length).toBeGreaterThan(0)
    })

    it('reason is non-empty string for BLOCK', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.50, scoreAdv: 0.80, hasHighCriticalVuln: false, isCrashing: true },
        2,
        defaultConfig,
        true
      )
      expect(result.reason.length).toBeGreaterThan(0)
    })

    it('reason is non-empty string for FAIL', () => {
      const result = ValidationGate.evaluate(
        { scoreTL: 0.50, scoreAdv: 0.80, hasHighCriticalVuln: false, isCrashing: false },
        2,
        defaultConfig,
        false
      )
      expect(result.reason.length).toBeGreaterThan(0)
    })
  })
})
