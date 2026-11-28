import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MetaHarnessAgentAdapter } from '../MetaHarnessAgentAdapter'
import type { DiagnoseSessionRecord } from '../types'
import { AgentRunnerFactory } from '../../agent-runner/AgentRunnerFactory'
import { writeEvaluatedCandidate, writeLegacyHistory, writeTrace } from './fixtures'
import type { DreamingEpisode } from '../../file-state/DreamingEpisodeStore'

describe('MetaHarnessAgentAdapter', () => {
  let workingDir: string

  beforeEach(() => {
    workingDir = mkdtempSync(join(tmpdir(), 'meta-harness-agent-'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(workingDir, { recursive: true, force: true })
  })

  const sampleRecord: DiagnoseSessionRecord = {
    sessionId: 'session-original-123',
    runner: 'copilot-cli',
    agent: 'developer-backend',
    skill: 'tdd-orchestrator',
    model: 'gpt-6-luna',
    effort: 'xhigh',
    status: 'pending',
    timestamp: '2026-08-15T10:00:00.000Z',
  }

  it('requires a source-matched trace and a receipt for the same Dreaming episode', async () => {
    const session = { ...sampleRecord, traceId: 'session-2026-08-15-001', status: 'completed' as const }
    const project = { root: workingDir, taskIds: ['T01'] }
    const episode: DreamingEpisode = {
      id: 'episode-1', capturedAt: session.timestamp, featureId: 'F001', domain: 'retry',
      reworks: 0, handoffDigest: 'digest', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 },
      sourceSessions: [session.sessionId], projects: [project], review: 'PASS', closed: true,
    }
    const run = vi.fn().mockResolvedValue({ raw: 'Unconfirmed outcome', success: true })
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })
    writeTrace(workingDir, session.traceId, 'other-source')
    expect((await adapter.invokeProjectDreaming(episode, project, [session])).success).toBe(false)
    expect(run).not.toHaveBeenCalled()

    writeTrace(workingDir, session.traceId, session.sessionId)
    expect((await adapter.invokeProjectDreaming(episode, project, [session])).success).toBe(false)
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ skill: 'harness-kit:project-dreaming', workspacePath: workingDir }))
    const prompt = run.mock.calls[0][0].prompt
    expect(prompt).toContain(join(workingDir, 'docs', 'harness-history', 'traces', session.traceId))
    expect(prompt).toContain('steps.md')
    expect(prompt).toContain('verdict.md')

    run.mockResolvedValue({
      raw: JSON.stringify({ episode_id: episode.id, status: 'incomplete', reason: 'Unable to read the linked trace.' }),
      success: true,
    })
    expect(await adapter.invokeProjectDreaming(episode, project, [session])).toMatchObject({
      success: false, raw: 'Unable to read the linked trace.',
    })
    run.mockResolvedValue({ raw: JSON.stringify({ episode_id: episode.id, status: 'incomplete' }), success: true })
    expect(await adapter.invokeProjectDreaming(episode, project, [session])).toMatchObject({
      success: false, raw: 'The runner reported incomplete without a reason.',
    })
    run.mockResolvedValue({ raw: JSON.stringify({ episode_id: episode.id, status: 'no_hypothesis' }), success: true })
    expect((await adapter.invokeProjectDreaming(episode, project, [session])).success).toBe(false)
    run.mockResolvedValue({ raw: JSON.stringify({ episode_id: episode.id, project: workingDir, feature: 'feature:retry', inspected_episode_ids: [episode.id], status: 'no_hypothesis', reason: 'No distinct test decision.', evidence_refs: ['trace#tests'] }), success: true })
    expect((await adapter.invokeProjectDreaming(episode, project, [session])).success).toBe(true)
  })

  it('preserves a valid legacy Dreaming receipt for downstream verification', async () => {
    const session = { ...sampleRecord, traceId: 'session-2026-08-15-001', status: 'completed' as const }
    const project = { root: workingDir, taskIds: ['T01'] }
    const episode: DreamingEpisode = { id: 'episode-1', capturedAt: session.timestamp, featureId: 'F001', domain: 'retry', reworks: 0, handoffDigest: 'digest', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 }, sourceSessions: [session.sessionId], projects: [project], review: 'PASS', closed: true }
    writeTrace(workingDir, session.traceId, session.sessionId)
    const dir = join(workingDir, 'docs', 'harness-history', 'learning', 'active')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'legacy.md'), '## Origin evidence\nepisode-1\n')
    const raw = JSON.stringify({ episode_id: episode.id, status: 'recorded', hypothesis_id: 'legacy' })
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run: vi.fn().mockResolvedValue({ success: true, raw }) }, workingDir })
    expect(await adapter.invokeProjectDreaming(episode, project, [session])).toMatchObject({ success: true, raw })
  })

  it('reuses a source-matched trace with metadata in a Markdown table', async () => {
    const traceId = 'session-2026-08-15-001'
    writeTrace(workingDir, traceId, sampleRecord.sessionId)
    const path = join(workingDir, 'docs/harness-history/traces', traceId, 'metadata.md')
    const original = readFileSync(path, 'utf8')
    const rows = original.split('\n').map(line => line.replace(/^- \*\*(.+?):\*\* (.*)$/, '| $1 | $2 |'))
    writeFileSync(path, ['# Session Metadata', '| Field | Value |', '|---|---|', ...rows].join('\n'))
    const run = vi.fn()
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })
    expect((await adapter.invoke(sampleRecord, traceId)).success).toBe(true)
    expect(run).not.toHaveBeenCalled()
    expect(readFileSync(path, 'utf8')).toContain('| source_session_id | session-original-123 |')
  })

  it.each(['same', 'conflicting'])('rejects %s duplicate source identity across formats without invoking the runner', async duplicate => {
    const traceId = 'session-2026-08-15-001'
    writeTrace(workingDir, traceId, sampleRecord.sessionId)
    const path = join(workingDir, 'docs/harness-history/traces', traceId, 'metadata.md')
    writeFileSync(path, readFileSync(path, 'utf8') + `\n| source_session_id | ${duplicate === 'same' ? sampleRecord.sessionId : 'different-session'} |\n`)
    const run = vi.fn()
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })
    await expect(adapter.invoke(sampleRecord, traceId)).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })

  it('does not count ambiguous identities as legacy traces', async () => {
    const traceId = 'session-2026-08-15-001'
    writeTrace(workingDir, traceId, sampleRecord.sessionId)
    const path = join(workingDir, 'docs/harness-history/traces', traceId, 'metadata.md')
    writeFileSync(path, readFileSync(path, 'utf8') + '\n| source_session_id | other-source |\n')
    writeLegacyHistory(workingDir, 2)
    // Restore the ambiguous trace after the legacy fixture creates its IDs.
    writeTrace(workingDir, traceId, sampleRecord.sessionId)
    writeFileSync(path, readFileSync(path, 'utf8') + '\n| source_session_id | other-source |\n')
    const run = vi.fn()
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })
    expect(JSON.parse((await adapter.invokeMetaHarness(sampleRecord)).raw)).toMatchObject({ status: 'no_candidate' })
    expect(run).not.toHaveBeenCalled()
  })

  it('accepts outcome fields in a table while ignoring fenced examples', async () => {
    const traceId = 'session-2026-08-15-001'
    writeTrace(workingDir, traceId, sampleRecord.sessionId)
    const dir = join(workingDir, 'docs/harness-history/traces', traceId)
    const metadata = join(dir, 'metadata.md')
    writeFileSync(metadata, readFileSync(metadata, 'utf8') + '\n```markdown\n- **source_session_id:** other-session\n```\n')
    writeFileSync(join(dir, 'score.md'), '| Field | Value |\n|---|---|\n| outcome | unknown |\n| outcome_evidence | Not observed |\n')
    const run = vi.fn()
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })
    expect((await adapter.invoke(sampleRecord, traceId)).success).toBe(true)
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects a trace without source identity or task outcome', async () => {
    const traceId = 'session-2026-08-15-001'
    const traceDir = join(workingDir, 'docs', 'harness-history', 'traces', traceId)
    const run = vi.fn(async () => {
      mkdirSync(traceDir, { recursive: true })
      for (const file of ['metadata.md', 'input.md', 'steps.md', 'score.md', 'verdict.md']) {
        writeFileSync(join(traceDir, file), '# Trace evidence\n', 'utf8')
      }
      return { success: true, raw: 'Trace recorded' }
    })
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })

    await expect(adapter.invoke(sampleRecord, traceId)).rejects.toThrow('source_session_id')
  })

  it('invokes runner inside the existing session with trace guidance, pre-computed ID, and multiple of 5 check', async () => {
    const traceId = 'session-2026-08-15-001'
    const mockRunner = {
      type: 'copilot-cli',
      run: vi.fn(async () => {
        writeTrace(workingDir, traceId, sampleRecord.sessionId)
        return { success: true, raw: 'Trace recorded' }
      }),
    }

    const adapter = new MetaHarnessAgentAdapter({
      agentRunner: mockRunner as any,
      workingDir,
    })

    const output = await adapter.invoke(sampleRecord, traceId, {
      model: 'gpt-6-luna',
      effort: 'xhigh',
    })

    expect(output.success).toBe(true)
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'harness-kit:meta-harness-agent',
        session: { id: 'session-original-123' },
        model: 'gpt-6-luna',
        effort: 'xhigh',
        prompt: expect.stringContaining('session_id: session-2026-08-15-001'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('harness-kit:harness-tracer'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('multiple of 5'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('STRICT WORKSPACE CONSTRAINTS'),
      })
    )
  })

  it('runs frontier evaluation after the fifth verified trace and skips duplicate recording on retry', async () => {
    writeLegacyHistory(workingDir, 4)
    const traceId = 'session-2026-08-15-005'
    const run = vi.fn()
      .mockImplementationOnce(async () => {
        writeTrace(workingDir, traceId, sampleRecord.sessionId)
        return { success: true, raw: 'Trace recorded' }
      })
      .mockResolvedValueOnce({ success: true, raw: 'Frontier updated' })
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })

    await adapter.invoke(sampleRecord, traceId)
    await adapter.invoke(sampleRecord, traceId)

    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenNthCalledWith(2, expect.objectContaining({ skill: 'harness-kit:harness-evaluator' }))
  })

  it('evaluates when the fifth verified trace is reached within a batch', async () => {
    const records = Array.from({ length: 6 }, (_, i) => ({ ...sampleRecord, phase: 'DEVELOPMENT', sessionId: `source-${i + 1}`, traceId: `session-2026-08-15-00${i + 1}`, status: (i < 3 ? 'completed' : 'pending') as 'completed' | 'pending' }))
    const ledgerDir = join(workingDir, 'docs', 'product')
    mkdirSync(ledgerDir, { recursive: true })
    writeFileSync(join(ledgerDir, 'diagnose-sessions.jsonl'), records.map(record => JSON.stringify(record)).join('\n'))
    for (const record of records.slice(0, 4)) writeTrace(workingDir, record.traceId, record.sessionId)
    const run = vi.fn(async (invocation: any) => {
      if (invocation.skill !== 'harness-kit:harness-evaluator') writeTrace(workingDir, records[4].traceId, records[4].sessionId)
      return { success: true, raw: 'ok' }
    })
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })
    await adapter.invoke(records[4], records[4].traceId, undefined, [records[3].traceId])
    expect(run.mock.calls.filter(([call]) => call.skill === 'harness-kit:harness-evaluator')).toHaveLength(1)
  })

  it('does not invoke the proposer with fewer than three complete traces', async () => {
    writeLegacyHistory(workingDir, 2)
    const run = vi.fn()
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })

    const output = await adapter.invokeMetaHarness(sampleRecord)

    expect(JSON.parse(output.raw)).toMatchObject({ status: 'no_candidate' })
    expect(run).not.toHaveBeenCalled()
  })

  it('limits SDK proposal evidence to eligible completed sessions', async () => {
    const records = ['PLANNING', 'DEVELOPMENT', 'REVIEW'].map((phase, index) => {
      const traceId = `session-2026-08-15-00${index + 1}`
      const sessionId = `source-${index + 1}`
      writeTrace(workingDir, traceId, sessionId)
      return { ...sampleRecord, phase, traceId, sessionId, status: 'completed' as const }
    })
    writeTrace(workingDir, 'session-2026-08-15-004', 'source-bootstrap')
    const run = vi.fn().mockResolvedValue({ success: true, raw: '{}' })
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })
    await adapter.invokeMetaHarness(records[0], undefined, [], records)
    const prompt = run.mock.calls[0][0].prompt as string
    expect(prompt).toContain('session-2026-08-15-001')
    expect(prompt).toContain('session-2026-08-15-003')
    expect(prompt).not.toContain('session-2026-08-15-004')
    expect(prompt).toContain('Read and cite only the eligible trace IDs')
  })

  it('invokes harness-kit:meta-harness separately when invokeMetaHarness is called', async () => {
    writeLegacyHistory(workingDir)
    const mockRunner = {
      type: 'claude-cli',
      run: vi.fn().mockResolvedValue({ success: true, raw: 'Proposal created' }),
    }

    const adapter = new MetaHarnessAgentAdapter({
      agentRunner: mockRunner as any,
      workingDir,
    })

    const output = await adapter.invokeMetaHarness(
      { ...sampleRecord, runner: 'claude-cli' },
      {
        model: 'anthropic.claude-5-sonnet',
        effort: 'low',
      }
    )

    expect(output.success).toBe(true)
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'harness-kit:meta-harness-agent',
        skill: 'harness-kit:meta-harness',
        model: 'anthropic.claude-5-sonnet',
        effort: 'low',
        prompt: expect.stringContaining('harness-kit:meta-harness'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('/docs/harness-history/candidates'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('STRICT WORKSPACE CONSTRAINTS'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('at most one candidate'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('significant impact'),
      })
    )
  })

  it.each(['codex-cli', 'claude-cli', 'copilot-cli'])('supplies recorded plugin skills to %s and allows proposals from incomplete metrics', async (runnerType) => {
    const codexHome = join(workingDir, 'codex')
    const project = join(workingDir, 'project')
    const cache = join(codexHome, 'plugins', 'cache', 'harness-kit', 'harness-kit')
    for (const [version, content] of [['1.9.0', 'Older skill'], ['1.10.0', 'Loaded skill baseline']]) {
      const directory = join(cache, version, 'skills', 'tdd-orchestrator')
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'SKILL.md'), content)
    }
    const unrelated = join(cache, '1.10.0', 'skills', 'unrelated')
    mkdirSync(unrelated, { recursive: true })
    writeFileSync(join(unrelated, 'SKILL.md'), 'Unrelated skill content')
    mkdirSync(project)
    writeLegacyHistory(project)
    vi.stubEnv('CODEX_HOME', codexHome)
    const run = vi.fn().mockResolvedValue({ success: true, raw: 'Proposal created' })
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir: project })

    await adapter.invokeMetaHarness(
      { ...sampleRecord, runner: runnerType, skill: 'harness-kit:project-memory' },
      undefined,
      ['harness-kit:tdd-orchestrator', 'harness-kit:../unrelated'],
    )

    const { prompt } = run.mock.calls[0][0]
    expect(prompt).toContain('Read-only active skill references (JSON):')
    expect(prompt).toContain('"version":"1.10.0"')
    expect(prompt).toContain('A current reference is not evidence of the version that ran')
    expect(prompt).toContain('Loaded skill baseline')
    expect(prompt).not.toContain('Older skill')
    expect(prompt).not.toContain('Unrelated skill content')
    expect(prompt).toContain('If composite scores are unavailable')
    expect(prompt).toContain('paired evaluation after proposal')
    expect(prompt).toContain('Only write candidate files inside')
    expect(prompt).toContain('STRICT WORKSPACE CONSTRAINTS')
  })

  it('creates runner dynamically using session.runner when no custom runner is injected', async () => {
    const mockRunner = {
      type: 'claude-cli',
      run: vi.fn().mockResolvedValue({ success: false, raw: 'Runner failed' }),
    }
    const createSpy = vi.spyOn(AgentRunnerFactory, 'create').mockReturnValue(mockRunner as any)

    const adapter = new MetaHarnessAgentAdapter({ workingDir })
    await adapter.invoke(
      { ...sampleRecord, runner: 'claude-cli', sessionId: 'sess-abc-789' },
      'session-2026-08-15-002'
    )

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'claude-cli',
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        session: { id: 'sess-abc-789' },
      })
    )

    createSpy.mockRestore()
  })

  it('applies the exact evaluated candidate without invoking a model', async () => {
    const { activePath, candidate, candidateId, targetSkill } = writeEvaluatedCandidate(workingDir)
    const run = vi.fn()
    const adapter = new MetaHarnessAgentAdapter({ agentRunner: { run }, workingDir })

    const output = await adapter.invokeCandidatePromotion(candidateId, targetSkill)

    expect(run).not.toHaveBeenCalled()
    expect(output.success).toBe(true)
    expect(readFileSync(activePath, 'utf8')).toBe(candidate)
    expect(JSON.parse(output.raw)).toMatchObject({ candidateId, targetSkill, status: 'PROMOTED' })
  })
})
