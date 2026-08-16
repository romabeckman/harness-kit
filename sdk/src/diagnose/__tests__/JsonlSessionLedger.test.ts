import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { JsonlSessionLedger } from '../JsonlSessionLedger'
import type { DiagnoseSessionRecord } from '../types'

describe('JsonlSessionLedger', () => {
  let testDir: string
  let ledgerPath: string

  const sampleRecord1: DiagnoseSessionRecord = {
    sessionId: 'session-2026-08-15-001',
    runner: 'claude-cli',
    agent: 'developer-backend',
    status: 'pending',
    snapshot: {
      runner: 'claude-cli',
      model: 'anthropic.claude-5-sonnet',
      effort: 'medium',
      scopeSummary: 'Feature 1',
      featureIds: ['F001'],
      phaseTimingsMs: { BOOTSTRAP: 100 },
    },
    timestamp: '2026-08-15T12:00:00.000Z',
  }

  const sampleRecord2: DiagnoseSessionRecord = {
    sessionId: 'session-2026-08-15-002',
    runner: 'copilot-cli',
    agent: 'developer-backend',
    status: 'pending',
    snapshot: {
      runner: 'copilot-cli',
      model: 'gpt-5.6-luna',
      effort: 'xhigh',
      scopeSummary: 'Feature 2',
      featureIds: ['F002'],
      phaseTimingsMs: { BOOTSTRAP: 200 },
    },
    timestamp: '2026-08-15T13:00:00.000Z',
  }

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'harness-ledger-test-'))
    ledgerPath = join(testDir, 'docs', 'product', 'diagnose-sessions.jsonl')
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns empty array when ledger file does not exist', () => {
    const ledger = new JsonlSessionLedger(ledgerPath)
    expect(ledger.loadAll()).toEqual([])
    expect(ledger.loadPending()).toEqual([])
  })

  it('appends records to the JSONL file', () => {
    const ledger = new JsonlSessionLedger(ledgerPath)
    ledger.append(sampleRecord1)
    ledger.append(sampleRecord2)

    expect(existsSync(ledgerPath)).toBe(true)
    const content = readFileSync(ledgerPath, 'utf8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(2)

    const all = ledger.loadAll()
    expect(all).toHaveLength(2)
    expect(all[0].sessionId).toBe('session-2026-08-15-001')
    expect(all[1].sessionId).toBe('session-2026-08-15-002')
  })

  it('filters pending records correctly', () => {
    const ledger = new JsonlSessionLedger(ledgerPath)
    ledger.append(sampleRecord1)
    ledger.append({ ...sampleRecord2, status: 'completed' })

    const pending = ledger.loadPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].sessionId).toBe('session-2026-08-15-001')
  })

  it('updates session status via atomic rewrite', () => {
    const ledger = new JsonlSessionLedger(ledgerPath)
    ledger.append(sampleRecord1)
    ledger.append(sampleRecord2)

    ledger.rewriteStatus('session-2026-08-15-001', 'completed')

    const pending = ledger.loadPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].sessionId).toBe('session-2026-08-15-002')

    const all = ledger.loadAll()
    expect(all[0].status).toBe('completed')
    expect(all[1].status).toBe('pending')
  })

  it('handles malformed JSON lines safely without crashing', () => {
    const ledger = new JsonlSessionLedger(ledgerPath)
    ledger.append(sampleRecord1)

    // append corrupted line
    const { appendFileSync } = require('node:fs')
    appendFileSync(ledgerPath, '{ invalid json line \n')
    ledger.append(sampleRecord2)

    const all = ledger.loadAll()
    expect(all).toHaveLength(2)
    expect(all.map((r) => r.sessionId)).toEqual([
      'session-2026-08-15-001',
      'session-2026-08-15-002',
    ])
  })
})
