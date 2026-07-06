import { describe, it, expect, beforeEach } from 'vitest'
import { DebugContext } from '../../src/cli/DebugContext'

describe('T20 — DebugContext', () => {
  beforeEach(() => {
    DebugContext.reset()
  })

  it('is disabled by default', () => {
    expect(DebugContext.enabled).toBe(false)
  })

  it('enable() sets enabled to true', () => {
    DebugContext.enable()
    expect(DebugContext.enabled).toBe(true)
  })

  it('reset() sets enabled back to false', () => {
    DebugContext.enable()
    expect(DebugContext.enabled).toBe(true)
    DebugContext.reset()
    expect(DebugContext.enabled).toBe(false)
  })

  it('multiple enable() calls are idempotent', () => {
    DebugContext.enable()
    DebugContext.enable()
    expect(DebugContext.enabled).toBe(true)
  })
})
