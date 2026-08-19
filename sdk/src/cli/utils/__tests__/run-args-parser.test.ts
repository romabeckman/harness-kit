import { describe, it, expect } from 'vitest'
import { parseRunArgs } from '../run-args-parser'
import { resolveMode } from '../../services/run-service'
import { RunMode, Complexity } from '../../../orchestrator/types'

// ─── parseRunArgs ────────────────────────────────────────────────────────────

describe('parseRunArgs', () => {
  describe('--mode / -M', () => {
    it('returns undefined mode when flag is absent', () => {
      const result = parseRunArgs([])
      expect(result.mode).toBeUndefined()
    })

    it('parses --effort and -e flags', () => {
      expect(parseRunArgs(['--effort', 'high']).effort).toBe('high')
      expect(parseRunArgs(['-e', 'medium']).effort).toBe('medium')
      expect(parseRunArgs(['--effort=low']).effort).toBe('low')
    })

    it.each([
      ['--mode quick', 'quick', RunMode.QUICK],
      ['--mode fast', 'fast', RunMode.FAST],
      ['--mode thinking', 'thinking', RunMode.THINKING],
      ['--mode deep_thinking', 'deep_thinking', RunMode.DEEP_THINKING],
    ])('parses %s', (_, rawValue, expected) => {
      const result = parseRunArgs(['--mode', rawValue])
      expect(result.mode).toBe(expected)
    })

    it('parses -M alias', () => {
      const result = parseRunArgs(['-M', 'fast'])
      expect(result.mode).toBe(RunMode.FAST)
    })

    it('supports --mode=quick inline syntax', () => {
      const result = parseRunArgs(['--mode=quick'])
      expect(result.mode).toBe(RunMode.QUICK)
    })

    it('is case-insensitive', () => {
      const result = parseRunArgs(['--mode', 'QUICK'])
      expect(result.mode).toBe(RunMode.QUICK)
    })

    it('ignores unknown mode values', () => {
      const result = parseRunArgs(['--mode', 'turbo'])
      expect(result.mode).toBeUndefined()
    })
  })

  describe('--refine', () => {
    it('returns refine undefined when --refine flag is absent', () => {
      const result = parseRunArgs([])
      expect(result.refine).toBeUndefined()
    })

    it('sets refine to true when --refine flag is present', () => {
      const result = parseRunArgs(['--refine'])
      expect(result.refine).toBe(true)
    })
  })

  describe('--complexity / -c', () => {
    it('returns undefined complexity when flag is absent', () => {
      const result = parseRunArgs([])
      expect(result.complexity).toBeUndefined()
    })

    it.each([
      ['--complexity LOW', 'LOW', Complexity.LOW],
      ['--complexity low', 'low', Complexity.LOW],
      ['--complexity HIGH', 'HIGH', Complexity.HIGH],
      ['--complexity high', 'high', Complexity.HIGH],
      ['--complexity AUTO', 'AUTO', Complexity.AUTO],
      ['--complexity auto', 'auto', Complexity.AUTO],
    ])('parses %s', (_, rawValue, expected) => {
      const result = parseRunArgs(['--complexity', rawValue])
      expect(result.complexity).toBe(expected)
    })

    it('parses -c alias', () => {
      const result = parseRunArgs(['-c', 'HIGH'])
      expect(result.complexity).toBe(Complexity.HIGH)
    })

    it('supports --complexity=LOW inline syntax', () => {
      const result = parseRunArgs(['--complexity=LOW'])
      expect(result.complexity).toBe(Complexity.LOW)
    })

    it('ignores unknown complexity values', () => {
      const result = parseRunArgs(['--complexity', 'EXTREME'])
      expect(result.complexity).toBeUndefined()
    })
  })

  describe('skip flags coexist with mode', () => {
    it('parses --mode quick alongside --skip-deploy', () => {
      const result = parseRunArgs(['--mode', 'quick', '--skip-deploy'])
      expect(result.mode).toBe(RunMode.QUICK)
      expect(result.skipDeploy).toBe(true)
    })

    it('parses --mode fast with --skip-validation', () => {
      const result = parseRunArgs(['--mode', 'fast', '--skip-validation'])
      expect(result.mode).toBe(RunMode.FAST)
      expect(result.skipValidation).toBe(true)
    })
  })
})

// ─── resolveMode ─────────────────────────────────────────────────────────────

describe('resolveMode', () => {
  it('defaults to AUTO complexity, no skips when mode is undefined', () => {
    const r = resolveMode(undefined)
    expect(r.complexity).toBe(Complexity.AUTO)
    expect(r.skipValidation).toBe(false)
    expect(r.skipMemory).toBe(false)
  })

  it('default mode → AUTO, no skips', () => {
    const r = resolveMode(RunMode.THINKING)
    expect(r.complexity).toBe(Complexity.AUTO)
    expect(r.skipValidation).toBe(false)
    expect(r.skipMemory).toBe(false)
  })

  it('quick mode → LOW + skipValidation + skipMemory', () => {
    const r = resolveMode(RunMode.QUICK)
    expect(r.complexity).toBe(Complexity.LOW)
    expect(r.skipValidation).toBe(true)
    expect(r.skipMemory).toBe(true)
  })

  it('fast mode → LOW, no skips', () => {
    const r = resolveMode(RunMode.FAST)
    expect(r.complexity).toBe(Complexity.LOW)
    expect(r.skipValidation).toBe(false)
    expect(r.skipMemory).toBe(false)
  })

  it('deep thinking mode → HIGH, no skips', () => {
    const r = resolveMode(RunMode.DEEP_THINKING)
    expect(r.complexity).toBe(Complexity.HIGH)
    expect(r.skipValidation).toBe(false)
    expect(r.skipMemory).toBe(false)
  })
})
