import { describe, expect, it, vi } from 'vitest'
import { runWithAgentNameFallback } from '../AgentNameFallback'
import type { AgentInvocation } from '../types'

const invocation: AgentInvocation = {
  agent: 'harness-kit:software-architect',
  skill: 'harness-kit:project-memory',
  mode: 'autonomous',
  prompt: 'Execute task',
  session: { id: 'session-1' },
}

describe('agent name fallback', () => {
  it('keeps the namespaced name when it succeeds', async () => {
    const execute = vi.fn().mockResolvedValue({ raw: 'ok' })
    await expect(runWithAgentNameFallback(invocation, execute)).resolves.toEqual({ raw: 'ok' })
    expect(execute.mock.calls).toEqual([[invocation]])
  })

  it.each([
    'unknown agent "harness-kit:software-architect"',
    'Agent harness-kit:software-architect not found',
    'Unknown agent: harness-kit:software-architect',
  ])('retries once after %s, preserving the invocation', async (message) => {
    const execute = vi.fn().mockRejectedValueOnce(new Error(message)).mockResolvedValue({ raw: 'ok' })
    await expect(runWithAgentNameFallback(invocation, execute)).resolves.toEqual({ raw: 'ok' })
    expect(execute.mock.calls).toEqual([
      [invocation],
      [{ ...invocation, agent: 'software-architect' }],
    ])
    expect(invocation.agent).toBe('harness-kit:software-architect')
  })

  it.each(['', 'software-architect', 'other:software-architect', 'harness-kit:'])('does not retry agent %j', async (agent) => {
    const error = new Error(`unknown agent "${agent}"`)
    const execute = vi.fn().mockRejectedValue(error)
    await expect(runWithAgentNameFallback({ ...invocation, agent }, execute)).rejects.toBe(error)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it.each(['quota exceeded', 'aborted', 'timed out', 'unknown agent "another-agent"'])('does not retry unrelated error %s', async (message) => {
    const error = new Error(message)
    const execute = vi.fn().mockRejectedValue(error)
    await expect(runWithAgentNameFallback(invocation, execute)).rejects.toBe(error)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('propagates the fallback error without a third attempt', async () => {
    const error = new Error('unknown agent "software-architect"')
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('unknown agent "harness-kit:software-architect"'))
      .mockRejectedValue(error)
    await expect(runWithAgentNameFallback(invocation, execute)).rejects.toBe(error)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('does not start the fallback after cancellation', async () => {
    const controller = new AbortController()
    const execute = vi.fn().mockImplementation(async () => {
      controller.abort(new Error('cancelled'))
      throw new Error('unknown agent "harness-kit:software-architect"')
    })
    await expect(runWithAgentNameFallback(invocation, execute, controller.signal)).rejects.toThrow('cancelled')
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
