import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MetaHarnessAgentAdapter } from '../MetaHarnessAgentAdapter'
import type { DiagnoseSessionRecord } from '../types'
import { AgentRunnerFactory } from '../../agent-runner/AgentRunnerFactory'

describe('MetaHarnessAgentAdapter', () => {
  let workingDir: string

  beforeEach(() => {
    workingDir = mkdtempSync(join(tmpdir(), 'meta-harness-agent-'))
  })

  afterEach(() => {
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

  it('invokes runner inside the existing session with trace guidance, pre-computed ID, and multiple of 6 check', async () => {
    const traceId = 'session-2026-08-15-001'
    const mockRunner = {
      type: 'copilot-cli',
      run: vi.fn(async () => {
        const traceDir = join(workingDir, 'docs', 'harness-history', 'traces', traceId)
        mkdirSync(traceDir, { recursive: true })
        for (const file of ['metadata.md', 'input.md', 'steps.md', 'score.md', 'verdict.md']) {
          writeFileSync(join(traceDir, file), '# Trace evidence\n', 'utf8')
        }
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
        prompt: expect.stringContaining('multiple of 6'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('STRICT WORKSPACE CONSTRAINTS'),
      })
    )
  })

  it('invokes harness-kit:meta-harness separately when invokeMetaHarness is called', async () => {
    const mockRunner = {
      type: 'claude-cli',
      run: vi.fn().mockResolvedValue({ success: true, raw: 'Proposal created' }),
    }

    const adapter = new MetaHarnessAgentAdapter({
      agentRunner: mockRunner as any,
      workingDir: '/workspace/custom-project',
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
        prompt: expect.stringContaining('/workspace/custom-project/docs/harness-history/candidates'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('STRICT WORKSPACE CONSTRAINTS'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('up to 3 candidates'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('significant impact'),
      })
    )
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

  it('invokes autonomous candidate promotion with phaseKey diagnose and candidate metadata', async () => {
    const mockRunner = {
      type: 'claude-cli',
      run: vi.fn().mockResolvedValue({
        success: true,
        raw: '{"candidateId":"v001","targetSkill":"tdd-orchestrator","status":"PROMOTED","promoted":true}',
      }),
    }

    const adapter = new MetaHarnessAgentAdapter({
      agentRunner: mockRunner as any,
      workingDir: '/workspace/project-root',
    })

    const output = await adapter.invokeCandidatePromotion(
      'v001',
      'tdd-orchestrator',
      'claude-cli',
      {
        model: 'anthropic.claude-3-7-sonnet',
        effort: 'high',
      }
    )

    expect(output.success).toBe(true)
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'harness-kit:meta-harness-agent',
        phaseKey: 'diagnose',
        model: 'anthropic.claude-3-7-sonnet',
        effort: 'high',
        prompt: expect.stringContaining('candidate v001'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('/workspace/project-root/docs/harness-history/candidates/v001'),
      })
    )
  })
})
