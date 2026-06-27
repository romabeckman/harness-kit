import { describe, it, expect } from 'vitest'

describe('T15 — Public API (src/index.ts)', () => {
  it('HarnessOrchestrator is exported from index', async () => {
    const mod = await import('../../src/index')
    expect(mod.HarnessOrchestrator).toBeDefined()
    expect(typeof mod.HarnessOrchestrator).toBe('function')
  })

  it('NullAgentRunner is exported from index', async () => {
    const mod = await import('../../src/index')
    expect(mod.NullAgentRunner).toBeDefined()
    expect(typeof mod.NullAgentRunner).toBe('function')
  })

  it('Phase enum is exported from index', async () => {
    const mod = await import('../../src/index')
    expect(mod.Phase).toBeDefined()
    expect(mod.Phase.BOOTSTRAP).toBe('BOOTSTRAP')
    expect(mod.Phase.HALTED).toBe('HALTED')
  })

  it('Verdict enum is exported from index', async () => {
    const mod = await import('../../src/index')
    expect(mod.Verdict).toBeDefined()
    expect(mod.Verdict.PASS).toBe('PASS')
    expect(mod.Verdict.FAIL).toBe('FAIL')
  })

  it('ValidationGate is exported from index', async () => {
    const mod = await import('../../src/index')
    expect(mod.ValidationGate).toBeDefined()
    expect(typeof mod.ValidationGate.evaluate).toBe('function')
  })

  it('JsonExtractionProtocol is exported from index', async () => {
    const mod = await import('../../src/index')
    expect(mod.JsonExtractionProtocol).toBeDefined()
    expect(typeof mod.JsonExtractionProtocol.extract).toBe('function')
  })

  it('FileStateManager is exported from index', async () => {
    const mod = await import('../../src/index')
    expect(mod.FileStateManager).toBeDefined()
    expect(typeof mod.FileStateManager).toBe('function')
  })

  it('ContextAssembler is exported from index', async () => {
    const mod = await import('../../src/index')
    expect(mod.ContextAssembler).toBeDefined()
    expect(typeof mod.ContextAssembler.buildPhaseAPayload).toBe('function')
  })

  it('isExtractionError type guard is exported', async () => {
    const mod = await import('../../src/index')
    expect(mod.isExtractionError).toBeDefined()
    expect(typeof mod.isExtractionError).toBe('function')
  })

  it('isExtractionResult type guard is exported', async () => {
    const mod = await import('../../src/index')
    expect(mod.isExtractionResult).toBeDefined()
    expect(typeof mod.isExtractionResult).toBe('function')
  })

  it('OnDiskState is NOT exported from public index (internal type)', async () => {
    const mod = await import('../../src/index') as Record<string, unknown>
    expect(mod['OnDiskState']).toBeUndefined()
  })
})
