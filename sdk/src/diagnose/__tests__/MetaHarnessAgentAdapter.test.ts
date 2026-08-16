import { describe, it, expect, vi } from 'vitest'
import { MetaHarnessAgentAdapter } from '../MetaHarnessAgentAdapter'
import type { DiagnoseSessionRecord } from '../types'
import { AgentRunnerFactory } from '../../agent-runner/AgentRunnerFactory'

describe('MetaHarnessAgentAdapter', () => {
  const sampleRecord: DiagnoseSessionRecord = {
    sessionId: 'session-original-123',
    runner: 'copilot-cli',
    agent: 'developer-backend',
    skill: 'tdd-orchestrator',
    model: 'gpt-5.6-luna',
    effort: 'xhigh',
    status: 'pending',
    timestamp: '2026-08-15T10:00:00.000Z',
  }

  it('invokes runner inside the existing session with 3-skill guidance and pre-computed trace ID', async () => {
    const mockRunner = {
      type: 'copilot-cli',
      run: vi.fn().mockResolvedValue({ success: true, raw: 'Optimization proposed' }),
    }

    const adapter = new MetaHarnessAgentAdapter({
      agentRunner: mockRunner as any,
    })

    const output = await adapter.invoke(sampleRecord, 'session-2026-08-15-001', {
      model: 'gpt-5.6-luna',
      effort: 'xhigh',
    })

    expect(output.success).toBe(true)
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'harness-kit:meta-harness-agent',
        session: { id: 'session-original-123' },
        model: 'gpt-5.6-luna',
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
        prompt: expect.stringContaining('harness-kit:harness-evaluator'),
      })
    )
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('harness-kit:meta-harness'),
      })
    )
  })

  it('creates runner dynamically using session.runner when no custom runner is injected', async () => {
    const mockRunner = {
      type: 'claude-cli',
      run: vi.fn().mockResolvedValue({ success: true, raw: 'OK' }),
    }
    const createSpy = vi.spyOn(AgentRunnerFactory, 'create').mockReturnValue(mockRunner as any)

    const adapter = new MetaHarnessAgentAdapter()
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
})
