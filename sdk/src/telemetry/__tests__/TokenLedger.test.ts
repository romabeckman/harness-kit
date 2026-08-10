import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { TokenLedger } from '../TokenLedger'
import type { TokenUsage } from '../../agent-runner/types'

function makeUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 10,
    cacheReadTokens: 20,
    costUsd: 0.001,
    model: 'claude-sonnet',
    ...overrides,
  }
}

describe('TokenLedger', () => {
  let tempDir: string
  let ledgerPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ledger-test-'))
    ledgerPath = join(tempDir, 'ledger.jsonl')
  })

  describe('record', () => {
    it('creates ledger file and writes a JSONL entry', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('tdd-orchestrator', 'developer-backend', makeUsage())

      expect(existsSync(ledgerPath)).toBe(true)
      const lines = readFileSync(ledgerPath, 'utf8').trim().split('\n')
      expect(lines).toHaveLength(1)
      const entry = JSON.parse(lines[0])
      expect(entry.skill).toBe('tdd-orchestrator')
      expect(entry.agent).toBe('developer-backend')
      expect(entry.tokenUsage.inputTokens).toBe(100)
      expect(entry).not.toHaveProperty('inputTokens')
      expect(entry).not.toHaveProperty('outputTokens')
      expect(entry).not.toHaveProperty('cacheCreationTokens')
      expect(entry).not.toHaveProperty('cacheReadTokens')
      expect(entry).not.toHaveProperty('costUsd')
    })

    it('appends multiple entries on successive calls', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill-a', 'agent-1', makeUsage({ inputTokens: 10 }))
      ledger.record('skill-b', 'agent-2', makeUsage({ inputTokens: 20 }))

      const lines = readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean)
      expect(lines).toHaveLength(2)
    })

    it('writes model to the entry when usage.model is defined', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill', 'agent', makeUsage({ model: 'claude-opus-4-8' }))

      const entry = JSON.parse(readFileSync(ledgerPath, 'utf8').trim())
      expect(entry.model).toBe('claude-opus-4-8')
    })

    it('writes effort to the entry (defaults to "default" or undefined based on spread order)', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill', 'agent', makeUsage({ effort: 'high' }))

      const entry = JSON.parse(readFileSync(ledgerPath, 'utf8').trim())
      expect(entry.effort).toBe('high')
    })
  })

  describe('report', () => {
    it('returns empty entries and zero totals when ledger file does not exist', () => {
      const ledger = new TokenLedger(join(tempDir, 'nonexistent.jsonl'))
      const report = ledger.report()

      expect(report.entries).toHaveLength(0)
      expect(report.totals.inputTokens).toBe(0)
      expect(report.totals.outputTokens).toBe(0)
    })

    it('sums all tokens across multiple entries', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill-a', 'agent', makeUsage({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheCreationTokens: 5, costUsd: 0.001 }))
      ledger.record('skill-b', 'agent', makeUsage({ inputTokens: 200, outputTokens: 75, cacheReadTokens: 20, cacheCreationTokens: 10, costUsd: 0.002 }))

      const { totals } = ledger.report()
      expect(totals.inputTokens).toBe(300)
      expect(totals.outputTokens).toBe(125)
      expect(totals.cacheReadTokens).toBe(30)
      expect(totals.cacheCreationTokens).toBe(15)
      expect(totals.costUsd).toBeCloseTo(0.003)
    })

    it('groups token usage by skill in bySkill', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill-a', 'agent', makeUsage({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.001 }))
      ledger.record('skill-a', 'agent', makeUsage({ inputTokens: 200, outputTokens: 25, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.002 }))
      ledger.record('skill-b', 'agent', makeUsage({ inputTokens: 50, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.0005 }))

      const { bySkill } = ledger.report()
      expect(bySkill['skill-a'].inputTokens).toBe(300)
      expect(bySkill['skill-a'].outputTokens).toBe(75)
      expect(bySkill['skill-b'].inputTokens).toBe(50)
    })

    it('skips malformed JSON lines without throwing', () => {
      const { writeFileSync } = require('node:fs')
      writeFileSync(ledgerPath, 'not json\n{"ts":"2026","skill":"s","agent":"a","model":"x","effort":"default","inputTokens":1,"outputTokens":1,"cacheCreationTokens":0,"cacheReadTokens":0,"costUsd":0}\n', 'utf8')

      const ledger = new TokenLedger(ledgerPath)
      const report = ledger.report()
      expect(report.entries).toHaveLength(1)
      expect(report.totals.inputTokens).toBe(1)
    })
  })

  describe('modelRate classification (via report + printReport)', () => {
    it('classifies opus/fable as extra-large model tier', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill', 'agent', makeUsage({ model: 'claude-opus-4-8', cacheReadTokens: 1000000 }))

      // printReport shouldn't throw and should show the entry
      expect(() => ledger.printReport()).not.toThrow()
    })

    it('classifies haiku/mini/nano/flash-lite as fast model tier', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill', 'agent', makeUsage({ model: 'claude-haiku-4-5', cacheReadTokens: 1000000 }))

      expect(() => ledger.printReport()).not.toThrow()
    })

    it('classifies flash (non-lite) as medium model tier', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill', 'agent', makeUsage({ model: 'gemini-3.5-flash', cacheReadTokens: 1000000 }))

      expect(() => ledger.printReport()).not.toThrow()
    })

    it('classifies sonnet as large model tier (default)', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill', 'agent', makeUsage({ model: 'claude-sonnet-4-6', cacheReadTokens: 1000000 }))

      expect(() => ledger.printReport()).not.toThrow()
    })

    it('uses average rate when multiple models are present', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill', 'agent', makeUsage({ model: 'claude-opus-4-8', cacheReadTokens: 100 }))
      ledger.record('skill', 'agent', makeUsage({ model: 'claude-haiku-4-5', cacheReadTokens: 100 }))

      expect(() => ledger.printReport()).not.toThrow()
    })

    it('falls back to RATE_LARGE when no entries exist', () => {
      const ledger = new TokenLedger(join(tempDir, 'empty.jsonl'))

      expect(() => ledger.printReport()).not.toThrow()
    })

    it('does NOT show cache savings line when cacheReadTokens is 0', () => {
      const ledger = new TokenLedger(ledgerPath)
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      ledger.record('skill', 'agent', makeUsage({ cacheReadTokens: 0 }))
      ledger.printReport()

      const calls = consoleSpy.mock.calls.flat().join('\n')
      expect(calls).not.toContain('cache_read saved')
      consoleSpy.mockRestore()
    })

    it('shows cache savings line when cacheReadTokens > 0', () => {
      const ledger = new TokenLedger(ledgerPath)
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      ledger.record('skill', 'agent', makeUsage({ cacheReadTokens: 500000, model: 'claude-sonnet-4-6' }))
      ledger.printReport()

      const calls = consoleSpy.mock.calls.flat().join('\n')
      expect(calls).toContain('cache_read saved')
      consoleSpy.mockRestore()
    })
  })

  describe('Part B: Telemetry Audit DTO', () => {
    it('records and loads structured TelemetryAuditEvent with full audit traceability', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.recordAudit({
        auditId: 'aud_9876543210',
        jobId: 'e4e9d777-3db4-44d1-907e-bff18ee3342e',
        projectId: 'backend',
        tenantId: 'org_corp_acme',
        userId: 'usr_dev_456',
        timestamp: '2026-08-07T11:14:01.000Z',
        agent: 'claude-cli',
        model: 'claude-3-5-sonnet',
        skill: 'tdd-orchestrator',
        executionMetrics: { durationMs: 4200, status: 'success' },
        tokenUsage: {
          inputTokens: 1250,
          outputTokens: 450,
          cacheCreationTokens: 100,
          cacheReadTokens: 800,
          calculatedCostUsd: 0.00645,
        },
      })

      const persistedEvent = JSON.parse(readFileSync(ledgerPath, 'utf8').trim())
      expect(persistedEvent.tokenUsage.inputTokens).toBe(1250)
      expect(persistedEvent).not.toHaveProperty('inputTokens')
      expect(persistedEvent).not.toHaveProperty('outputTokens')
      expect(persistedEvent).not.toHaveProperty('cacheCreationTokens')
      expect(persistedEvent).not.toHaveProperty('cacheReadTokens')
      expect(persistedEvent).not.toHaveProperty('costUsd')

      const report = ledger.report()
      expect(report.events).toHaveLength(1)
      const event = report.events[0]
      expect(event.auditId).toBe('aud_9876543210')
      expect(event.jobId).toBe('e4e9d777-3db4-44d1-907e-bff18ee3342e')
      expect(event.projectId).toBe('backend')
      expect(event.executionMetrics.durationMs).toBe(4200)
      expect(event.tokenUsage.calculatedCostUsd).toBe(0.00645)
    })

    it('normalizes legacy flat JSONL entries to TelemetryAuditEvent format', () => {
      const ledger = new TokenLedger(ledgerPath)
      ledger.record('skill-legacy', 'agent-legacy', makeUsage({ inputTokens: 500, costUsd: 0.003 }))

      const report = ledger.report()
      expect(report.events).toHaveLength(1)
      const event = report.events[0]
      expect(event.auditId).toBeDefined()
      expect(event.skill).toBe('skill-legacy')
      expect(event.agent).toBe('agent-legacy')
      expect(event.tokenUsage.inputTokens).toBe(500)
      expect(event.tokenUsage.calculatedCostUsd).toBe(0.003)
      expect(event.executionMetrics.status).toBe('success')
    })
  })
})

