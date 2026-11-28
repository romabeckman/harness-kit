import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cmdDiagnose, parseDiagnoseArgs } from '../diagnose-service'

import { AgentRunnerFactory } from '../../../agent-runner/AgentRunnerFactory'
import type { IAgentRunner } from '../../../agent-runner/IAgentRunner'
import { writeLegacyHistory, writeTrace } from '../../../diagnose/__tests__/fixtures'

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
        writeTrace(workspacePath, traceId, session.id)
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

  it('accepts a targeted episode and reports an empty Dreaming workspace separately', async () => {
    expect(parseDiagnoseArgs(['--project-dreaming', '--dreaming-project', 'sdk', '--dreaming-episode', 'ep-1']))
      .toMatchObject({ projectDreaming: true, dreamingProject: 'sdk', dreamingEpisode: 'ep-1' })
    await cmdDiagnose(tmpDir, ['--project-dreaming'])
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No eligible project episodes'))
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
      prompt: expect.stringContaining('harness-kit:harness-tracer'),
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
        writeTrace(tmpDir, traceId, record.sessionId, missingFile)
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

  it('reports an unevaluated candidate written during analysis of saved history', async () => {
    const candidateDir = join(tmpDir, 'docs', 'harness-history', 'candidates', 'v001')
    writeLegacyHistory(tmpDir)
    run.mockImplementation(async () => {
      mkdirSync(candidateDir, { recursive: true })
      writeFileSync(join(candidateDir, 'rationale.md'),
        '## Target Skill\nautonomous-orchestrator\n\n## Diagnosis\nPhase C timeout\n\n## Proposed Change\nAdd breaker\n')
      writeFileSync(join(candidateDir, 'diff.md'), '+ Limit retries in phase C\n')
      writeFileSync(join(candidateDir, 'SKILL.md'), '# Autonomous orchestrator\nLimit retries in phase C.\n')
      writeFileSync(join(candidateDir, 'score.md'), 'evaluated: false\npromoted: false\n')
      return {
        success: true,
        raw: '{"candidateId":"v001","targetSkill":"autonomous-orchestrator","status":"PROPOSED","decision":{"action":"EVALUATE_CANDIDATE"}}',
      }
    })

    const ledgerFile = join(productDir, 'diagnose-sessions.jsonl')
    const record = {
      sessionId: 'session-2026-08-15-001',
      runner: 'claude-cli',
      agent: 'developer-backend',
      status: 'completed',
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
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('EVALUATE_CANDIDATE'))
    expect(readFileSync(join(candidateDir, 'score.md'), 'utf8')).toContain('evaluated: false')
  })

  it('reanalyzes existing history and displays the optimizer blocker without claiming an existing candidate was created', async () => {
    const record = {
      sessionId: 'completed-codex-session',
      runner: 'codex-cli',
      agent: 'developer-backend',
      skill: 'harness-kit:tdd-orchestrator',
      status: 'completed',
      timestamp: '2026-08-15T12:00:00.000Z',
    }
    writeFileSync(join(productDir, 'diagnose-sessions.jsonl'), JSON.stringify(record) + '\n', 'utf8')
    writeLegacyHistory(tmpDir)
    mkdirSync(join(tmpDir, 'docs', 'harness-history', 'candidates', 'v001'), { recursive: true })
    run.mockResolvedValue({
      success: true,
      raw: '```json\n{"candidateId":null,"status":"blocked","decision":"Target skill baseline unavailable"}\n```',
    })

    await cmdDiagnose(tmpDir, ['--agent', 'codex-cli'])

    expect(run).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ skill: 'harness-kit:meta-harness' }))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Optimization Status: Blocked'))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Target skill baseline unavailable'))
    expect(consoleLogSpy.mock.calls.flat().join('\n')).not.toContain('v001')
  })
})
