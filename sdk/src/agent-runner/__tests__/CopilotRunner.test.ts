import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CopilotSDKRunner } from '../copilot-sdk/CopilotSDKRunner'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerFactory } from '../AgentRunnerFactory'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'

const { mockStart, mockStop, mockDestroy, mockSendAndWait, mockCreateSession } = vi.hoisted(() => {
  const mockStart = vi.fn().mockResolvedValue(undefined)
  const mockStop = vi.fn().mockResolvedValue(undefined)
  const mockDestroy = vi.fn().mockResolvedValue(undefined)
  const mockSendAndWait = vi.fn().mockResolvedValue({})
  const mockCreateSession = vi.fn().mockResolvedValue({
    sendAndWait: mockSendAndWait,
    destroy: mockDestroy,
    disconnect: mockDestroy,
  })
  return { mockStart, mockStop, mockDestroy, mockSendAndWait, mockCreateSession }
})

vi.mock('@github/copilot-sdk', () => {
  return {
    CopilotClient: class {
      start = mockStart
      stop = mockStop
      createSession = mockCreateSession
    },
    approveAll: vi.fn(),
  }
})

describe('CopilotSDKRunner', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockStart.mockResolvedValue(undefined)
    mockStop.mockResolvedValue(undefined)
    mockDestroy.mockResolvedValue(undefined)
    mockSendAndWait.mockResolvedValue({})
    mockCreateSession.mockResolvedValue({
      sendAndWait: mockSendAndWait,
      destroy: mockDestroy,
      disconnect: mockDestroy,
    })
  })

  it('registers in global registry', () => {
    expect(AgentRunnerRegistry.has('copilot-sdk')).toBe(true)
    const runner = AgentRunnerFactory.create({ type: 'copilot-sdk' })
    expect(runner).toBeInstanceOf(CopilotSDKRunner)
  })

  it('runs prompt via CopilotClient session', async () => {
    const runner = new CopilotSDKRunner({ model: 'test-model' })
    const out = await runner.run({
      skill: 'test-skill',
      agent: 'test-agent',
      mode: 'autonomous',
      payload: { some: 'payload' },
    })

    expect(mockStart).toHaveBeenCalled()
    expect(mockCreateSession).toHaveBeenCalledWith({
      model: 'test-model',
      onPermissionRequest: expect.any(Function),
    })
    // Signal forwarded — NOT a raw ms number (that was the bug)
    expect(mockSendAndWait).toHaveBeenCalledWith(
      { prompt: expect.stringContaining('test-skill') },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(mockDestroy).toHaveBeenCalled()
    expect(mockStop).toHaveBeenCalled()
    expect(out.success).toBe(true)
  })

  it('forwards reasoningEffort parameter to CopilotClient createSession', async () => {
    const runner = new CopilotSDKRunner({ model: 'test-model' })
    const out = await runner.run({
      skill: 'test-skill',
      agent: 'test-agent',
      mode: 'autonomous',
      payload: { some: 'payload' },
      effort: 'high',
    })

    expect(mockCreateSession).toHaveBeenCalledWith({
      model: 'test-model',
      onPermissionRequest: expect.any(Function),
      reasoningEffort: 'high',
    })
    expect(out.success).toBe(true)
  })

  it('throws TIMEOUT error and does NOT pass raw ms to sendAndWait', async () => {
    vi.useFakeTimers()

    // Simulate sendAndWait hanging forever
    mockSendAndWait.mockImplementation(
      (_msg: unknown, opts: { signal?: AbortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          if (opts?.signal?.aborted) {
            reject(new Error('AbortError'))
          } else {
            opts?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
          }
        })
    )
    mockCreateSession.mockResolvedValue({
      sendAndWait: mockSendAndWait,
      destroy: mockDestroy,
      disconnect: mockDestroy,
    })

    const runner = new CopilotSDKRunner({ model: 'test-model', timeoutMs: 5_000 })
    const promise = runner.run({
      skill: 'test-skill',
      agent: 'test-agent',
      mode: 'autonomous',
      payload: {},
    })
    promise.catch(() => { }) // Suppress unhandled rejection warning

    // Advance clock past timeout
    await vi.advanceTimersByTimeAsync(5_001)

    await expect(promise).rejects.toThrow(
      expect.objectContaining({ code: AgentRunnerErrorCode.TIMEOUT })
    )

    vi.useRealTimers()
  })

  it('propagates external AbortSignal and cancels the SDK call', async () => {
    const controller = new AbortController()

    mockSendAndWait.mockImplementation(
      (_msg: unknown, opts: { signal?: AbortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          if (opts?.signal?.aborted) {
            reject(new Error('AbortError'))
          } else {
            opts?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
          }
        })
    )
    mockCreateSession.mockResolvedValue({
      sendAndWait: mockSendAndWait,
      destroy: mockDestroy,
      disconnect: mockDestroy,
    })

    const runner = new CopilotSDKRunner({ model: 'test-model', timeoutMs: 60_000 })
    const promise = runner.run(
      { skill: 'test-skill', agent: 'test-agent', mode: 'autonomous', payload: {} },
      { signal: controller.signal }
    )

    controller.abort()

    await expect(promise).rejects.toThrow(
      expect.objectContaining({ code: AgentRunnerErrorCode.TIMEOUT })
    )
  })
})
