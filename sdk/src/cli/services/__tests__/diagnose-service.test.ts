import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cmdDiagnose } from '../diagnose-service'

import { AgentRunnerFactory } from '../../../agent-runner/AgentRunnerFactory'

vi.mock('../../../agent-runner/AgentRunnerFactory', () => ({
  AgentRunnerFactory: {
    create: vi.fn(() => ({
      type: 'mock-runner',
      run: vi.fn().mockResolvedValue({ success: true, raw: 'Optimized' }),
    })),
  },
}))

describe('cmdDiagnose CLI Service', () => {
  let tmpDir: string
  let productDir: string
  let consoleLogSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'harness-cli-diagnose-'))
    productDir = join(tmpDir, 'docs', 'product')
    mkdirSync(productDir, { recursive: true })
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('prints message when no pending sessions exist', async () => {
    await cmdDiagnose(tmpDir, [])
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('No pending diagnose sessions found')
    )
  })

  it('processes pending sessions from JSONL ledger in batches', async () => {
    const ledgerFile = join(productDir, 'diagnose-sessions.jsonl')
    const record = {
      sessionId: 'session-2026-08-15-001',
      runner: 'claude-cli',
      agent: 'developer-backend',
      status: 'pending',
      snapshot: {
        runner: 'claude-cli',
        model: 'anthropic.claude-5-sonnet',
        effort: 'medium',
        scopeSummary: 'Test',
        featureIds: [],
        phaseTimingsMs: {},
      },
      timestamp: '2026-08-15T12:00:00.000Z',
    }
    writeFileSync(ledgerFile, JSON.stringify(record) + '\n', 'utf8')

    await cmdDiagnose(tmpDir, ['--agent', 'claude-cli'])
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Diagnose batch completed')
    )
    // Check for final diagnosis report
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Harness Diagnose Report')
    )
  })

  it('displays candidate created in final report when candidate is generated', async () => {
    const candidateDir = join(tmpDir, 'docs', 'harness-history', 'candidates', 'v001')
    mkdirSync(candidateDir, { recursive: true })
    writeFileSync(
      join(candidateDir, 'rationale.md'),
      '## Target Skill\nautonomous-orchestrator\n\n## Diagnosis\nPhase C timeout\n\n## Proposed Change\nAdd breaker\n',
      'utf8'
    )

    const ledgerFile = join(productDir, 'diagnose-sessions.jsonl')
    const record = {
      sessionId: 'session-2026-08-15-001',
      runner: 'claude-cli',
      agent: 'developer-backend',
      status: 'pending',
      timestamp: '2026-08-15T12:00:00.000Z',
    }
    writeFileSync(ledgerFile, JSON.stringify(record) + '\n', 'utf8')

    await cmdDiagnose(tmpDir, ['--agent', 'claude-cli'])
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('v001')
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('autonomous-orchestrator')
    )
  })
})
