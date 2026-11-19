import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cmdDiagnose } from '../diagnose-service'

import { AgentRunnerFactory } from '../../../agent-runner/AgentRunnerFactory'
import type { IAgentRunner } from '../../../agent-runner/IAgentRunner'

const prompts = vi.hoisted(() => ({ select: vi.fn() }))

vi.mock('@inquirer/prompts', () => prompts)

vi.mock('../../../agent-runner/AgentRunnerFactory', () => ({
  AgentRunnerFactory: {
    create: vi.fn(),
  },
}))

const traceId = 'session-2026-08-15-001'
const traceFiles = ['metadata.md', 'input.md', 'steps.md', 'score.md', 'verdict.md']

describe('cmdDiagnose CLI Service', () => {
  let tmpDir: string
  let productDir: string
  let consoleLogSpy: any
  let consoleErrorSpy: any
  let run: ReturnType<typeof vi.fn<IAgentRunner['run']>>

  beforeEach(() => {
    prompts.select.mockReset()
    vi.mocked(AgentRunnerFactory.create).mockReset()
    tmpDir = mkdtempSync(join(tmpdir(), 'harness-cli-diagnose-'))
    productDir = join(tmpDir, 'docs', 'product')
    mkdirSync(productDir, { recursive: true })
    run = vi.fn<IAgentRunner['run']>(({ session, workspacePath }) => {
      if (session && workspacePath) {
        const traceDir = join(workspacePath, 'docs', 'harness-history', 'traces', traceId)
        mkdirSync(traceDir, { recursive: true })
        for (const file of traceFiles) {
          writeFileSync(join(traceDir, file), '# Trace evidence\n', 'utf8')
        }
      }
      return Promise.resolve({ success: true, raw: 'Optimized' })
    })
    vi.mocked(AgentRunnerFactory.create).mockReturnValue({ run })
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
    expect(prompts.select).not.toHaveBeenCalled()
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('No pending diagnose sessions found')
    )
  })

  it('prompts for an agent when pending sessions need diagnosis and --agent is absent', async () => {
    const ledgerFile = join(productDir, 'diagnose-sessions.jsonl')
    const record = {
      sessionId: 'session-2026-08-15-001',
      runner: 'claude-cli',
      agent: 'developer-backend',
      status: 'pending',
      timestamp: '2026-08-15T12:00:00.000Z',
    }
    writeFileSync(ledgerFile, JSON.stringify(record) + '\n', 'utf8')
    prompts.select.mockResolvedValueOnce('codex-cli')

    await cmdDiagnose(tmpDir, [])

    expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Select agent runner:',
      default: 'claude-cli',
    }))
    expect(AgentRunnerFactory.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'codex-cli' }))
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

    await cmdDiagnose(tmpDir, ['--agent', 'codex-cli', '--model=gpt-6.1-terra', '--effort=low'])
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: tmpDir,
      session: { id: record.sessionId },
      model: 'gpt-6.1-terra',
      effort: 'low',
      prompt: expect.stringContaining('Follow the trace recording instructions below'),
    }))
    const prompt = run.mock.calls[0][0].prompt as string
    expect(prompt).not.toContain('Invoke `harness-kit:harness-tracer`')
    for (const file of traceFiles) expect(prompt).toContain(file)
    expect(JSON.parse(readFileSync(ledgerFile, 'utf8')).status).toBe('completed')
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Diagnose batch completed')
    )
    // Check for final diagnosis report
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Harness Diagnose Report')
    )
  })

  it.each([
    { missingFile: 'metadata.md', partial: false },
    { missingFile: 'verdict.md', partial: true },
  ])('keeps a session pending when the runner resolves without $missingFile', async ({ missingFile, partial }) => {
    const ledgerFile = join(productDir, 'diagnose-sessions.jsonl')
    const record = {
      sessionId: 'original-codex-session',
      runner: 'codex-cli',
      agent: 'developer-backend',
      status: 'pending',
      timestamp: '2026-08-15T12:00:00.000Z',
    }
    writeFileSync(ledgerFile, JSON.stringify(record) + '\n', 'utf8')
    run.mockImplementation(async () => {
      if (partial) {
        const traceDir = join(tmpDir, 'docs', 'harness-history', 'traces', traceId)
        mkdirSync(traceDir, { recursive: true })
        for (const file of traceFiles) {
          writeFileSync(join(traceDir, file), file === missingFile ? '' : '# Partial trace\n', 'utf8')
        }
      }
      return { success: true, raw: 'Trace not created' }
    })

    await cmdDiagnose(tmpDir, ['--agent', 'codex-cli'])

    expect(JSON.parse(readFileSync(ledgerFile, 'utf8')).status).toBe('pending')
    expect(run).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(record.sessionId),
      expect.objectContaining({ message: expect.stringContaining(missingFile) }))
    if (partial) expect(consoleErrorSpy.mock.calls[0][1].message).not.toContain('metadata.md')
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Remaining Pending:  1'))
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
