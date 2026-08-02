import { describe, it, expect } from 'vitest'
import { resolveMode } from '../../src/cli/services/run-service'
import { RunMode, Complexity } from '../../src/orchestrator/types'

describe('resolveMode', () => {
  it('returns enableRefinement true for DEEP_THINKING mode', () => {
    const resolved = resolveMode(RunMode.DEEP_THINKING)
    expect(resolved.complexity).toBe(Complexity.HIGH)
    expect(resolved.enableRefinement).toBe(true)
  })

  it('returns enableRefinement undefined/falsy for other modes', () => {
    expect(resolveMode(RunMode.THINKING).enableRefinement).toBeFalsy()
    expect(resolveMode(RunMode.FAST).enableRefinement).toBeFalsy()
    expect(resolveMode(RunMode.QUICK).enableRefinement).toBeFalsy()
  })
})
