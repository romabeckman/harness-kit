import { describe, it, expect } from 'vitest'

describe('T15 — Public API (src/index.ts)', () => {
  it('HarnessOrchestrator is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.HarnessOrchestrator).toBeDefined()
    expect(typeof mod.HarnessOrchestrator).toBe('function')
  }, 30000) // 30 segundos

  it('NullAgentRunner is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.NullAgentRunner).toBeDefined()
    expect(typeof mod.NullAgentRunner).toBe('function')
  })

  it('Phase enum is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.Phase).toBeDefined()
    expect(mod.Phase.BOOTSTRAP).toBe('BOOTSTRAP')
    expect(mod.Phase.HALTED).toBe('HALTED')
  })

  it('Verdict enum is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.Verdict).toBeDefined()
    expect(mod.Verdict.PASS).toBe('PASS')
    expect(mod.Verdict.FAIL).toBe('FAIL')
  })

  it('ValidationGate is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.ValidationGate).toBeDefined()
    expect(typeof mod.ValidationGate.evaluate).toBe('function')
  })

  it('JsonExtractionProtocol is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.JsonExtractionProtocol).toBeDefined()
    expect(typeof mod.JsonExtractionProtocol.extract).toBe('function')
  })

  it('FileStateManager is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.FileStateManager).toBeDefined()
    expect(typeof mod.FileStateManager).toBe('function')
  })

  it('ContextAssembler is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.ContextAssembler).toBeDefined()
    expect(typeof mod.ContextAssembler.buildPlanningPayload).toBe('function')
  })

  it('isExtractionError type guard is exported', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.isExtractionError).toBeDefined()
    expect(typeof mod.isExtractionError).toBe('function')
  })

  it('isExtractionResult type guard is exported', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.isExtractionResult).toBeDefined()
    expect(typeof mod.isExtractionResult).toBe('function')
  })

  it('OnDiskState is NOT exported from public index (internal type)', async () => {
    const mod = await import('../../src/index.js') as Record<string, unknown>
    expect(mod['OnDiskState']).toBeUndefined()
  })

  it('ClaudeCLIRunner is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.ClaudeCLIRunner).toBeDefined()
    expect(typeof mod.ClaudeCLIRunner).toBe('function')
  })

  it('TokenLedger is exported from index', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.TokenLedger).toBeDefined()
    expect(typeof mod.TokenLedger).toBe('function')
  })

  it('TokenEntry type is accessible via runtime object shape (has ts, skill, agent + TokenUsage fields)', async () => {
    const mod = await import('../../src/index.js')
    // TokenEntry is a type — verify by constructing a conforming object and using TokenLedger to produce one
    const os = await import('node:os')
    const path = await import('node:path')
    const fs = await import('node:fs')
    const tmpPath = path.join(os.tmpdir(), `token-entry-test-${Date.now()}.jsonl`)
    const ledger = new mod.TokenLedger(tmpPath)
    ledger.record('test-skill', 'test-agent', {
      inputTokens: 1, outputTokens: 2, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0.001,
    })
    const report = ledger.report()
    expect(report.entries).toHaveLength(1)
    const entry = report.entries[0]
    // TokenEntry shape: ts, skill, agent, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, costUsd
    expect(entry).toHaveProperty('ts')
    expect(entry).toHaveProperty('skill', 'test-skill')
    expect(entry).toHaveProperty('agent', 'test-agent')
    expect(entry).toHaveProperty('inputTokens', 1)
    expect(entry).toHaveProperty('outputTokens', 2)
    expect(entry).toHaveProperty('cacheCreationTokens', 0)
    expect(entry).toHaveProperty('cacheReadTokens', 0)
    expect(entry).toHaveProperty('costUsd', 0.001)
    fs.rmSync(tmpPath, { force: true })
  })

  it('TokenReport type is accessible via runtime object shape (entries, totals, bySkill)', async () => {
    const mod = await import('../../src/index.js')
    const os = await import('node:os')
    const path = await import('node:path')
    const fs = await import('node:fs')
    const tmpPath = path.join(os.tmpdir(), `token-report-test-${Date.now()}.jsonl`)
    const ledger = new mod.TokenLedger(tmpPath)
    const report = ledger.report()
    // TokenReport shape: entries[], totals (TokenUsage), bySkill (Record<string, TokenUsage>)
    expect(report).toHaveProperty('entries')
    expect(Array.isArray(report.entries)).toBe(true)
    expect(report).toHaveProperty('totals')
    expect(report.totals).toHaveProperty('inputTokens')
    expect(report.totals).toHaveProperty('outputTokens')
    expect(report.totals).toHaveProperty('cacheCreationTokens')
    expect(report.totals).toHaveProperty('cacheReadTokens')
    expect(report.totals).toHaveProperty('costUsd')
    expect(report).toHaveProperty('bySkill')
    fs.rmSync(tmpPath, { force: true })
  })
})
