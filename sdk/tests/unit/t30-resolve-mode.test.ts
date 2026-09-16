import { describe, it, expect } from 'vitest'
import { resolveMode } from '../../src/cli/services/run-service'
import { RunMode, Complexity } from '../../src/orchestrator/types'

describe('resolveMode', () => {
  it('returns enableRefinement true for DEEP_THINKING mode', () => {
    const resolved = resolveMode(RunMode.DEEP_THINKING)
    expect(resolved.complexity).toBe(Complexity.HIGH)
    expect(resolved.enableRefinement).toBe(true)
  })

  it('returns enableRefinement true for THINKING mode', () => {
    expect(resolveMode(RunMode.THINKING).enableRefinement).toBe(true)
  })

  it('keeps refinement disabled for undefined mode fallback', () => {
    expect(resolveMode(undefined).enableRefinement).toBe(false)
  })

  it('returns enableRefinement false for modes without refinement', () => {
    expect(resolveMode(RunMode.FAST).enableRefinement).toBeFalsy()
    expect(resolveMode(RunMode.QUICK).enableRefinement).toBeFalsy()
  })

  it('keeps Memory enabled for QUICK mode', () => {
    expect(resolveMode(RunMode.QUICK).skipMemory).toBe(false)
  })

  it('maps RunModes to expected Complexity levels', () => {
    expect(resolveMode(RunMode.QUICK).complexity).toBe(Complexity.LOW)
    expect(resolveMode(RunMode.FAST).complexity).toBe(Complexity.LOW)
    expect(resolveMode(RunMode.THINKING).complexity).toBe(Complexity.AUTO)
    expect(resolveMode(RunMode.DEEP_THINKING).complexity).toBe(Complexity.HIGH)
    expect(resolveMode(undefined).complexity).toBe(Complexity.AUTO)
  })
})
