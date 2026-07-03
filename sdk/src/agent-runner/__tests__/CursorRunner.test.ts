import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockCreate, mockSend, mockWait, mockCancel, mockClose } = vi.hoisted(() => {
  const mockCancel = vi.fn().mockResolvedValue(undefined)
  const mockClose = vi.fn()
  const mockWait = vi.fn().mockResolvedValue({ status: 'completed', result: 'done' })
  const mockSend = vi.fn().mockImplementation(async () => ({ wait: mockWait, cancel: mockCancel }))
  const mockCreate = vi.fn().mockImplementation(async () => ({
    send: mockSend,
    close: mockClose,
  }))
  return { mockCreate, mockSend, mockWait, mockCancel, mockClose }
})

vi.mock('@cursor/sdk', () => ({
  Agent: { create: mockCreate },
}))

// ─── Import after mock ────────────────────────────────────────────────────────
import { CursorSDKRunner } from '../cursor-sdk/CursorSDKRunner'

const baseInvocation = {
  skill: 'test-skill',
  agent: 'test-agent',
  mode: 'autonomous' as const,
  payload: {},
}

describe('CursorSDKRunner — timeout concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    process.env.CURSOR_API_KEY = 'test-key'
    mockClose.mockReset()
    mockCancel.mockReset().mockResolvedValue(undefined)
    mockWait.mockReset().mockResolvedValue({ status: 'completed', result: 'done' })
    mockSend.mockReset().mockImplementation(async () => ({ wait: mockWait, cancel: mockCancel }))
    mockCreate.mockReset().mockImplementation(async () => ({ send: mockSend, close: mockClose }))
  })

  it('resolves successfully on happy path', async () => {
    const runner = new CursorSDKRunner({ timeoutMs: 5_000 })
    const out = await runner.run(baseInvocation)
    expect(out.success).toBe(true)
  })

  it('throws TIMEOUT error when run.wait() hangs past timeoutMs', async () => {
    // wait() never resolves
    mockWait.mockImplementation(() => new Promise(() => { }))
    mockSend.mockImplementation(async () => ({ wait: mockWait, cancel: mockCancel }))
    mockCreate.mockImplementation(async () => ({ send: mockSend, close: mockClose }))

    const runner = new CursorSDKRunner({ timeoutMs: 10 })
    const promise = runner.run(baseInvocation)

    await expect(promise).rejects.toThrow(
      expect.objectContaining({ code: AgentRunnerErrorCode.TIMEOUT })
    )
  })

  it('calls run.cancel() when timeout fires (no zombie background work)', async () => {
    mockWait.mockImplementation(() => new Promise(() => { }))
    mockSend.mockImplementation(async () => ({ wait: mockWait, cancel: mockCancel }))
    mockCreate.mockImplementation(async () => ({ send: mockSend, close: mockClose }))

    const runner = new CursorSDKRunner({ timeoutMs: 10 })
    const promise = runner.run(baseInvocation)

    await expect(promise).rejects.toThrow()

    // SDK cancel must be called to kill the background run
    expect(mockCancel).toHaveBeenCalled()
  })

  it('propagates external AbortSignal and rejects promptly', async () => {
    const controller = new AbortController()

    mockWait.mockImplementation(() => new Promise(() => { }))
    mockSend.mockImplementation(async () => ({ wait: mockWait, cancel: mockCancel }))
    mockCreate.mockImplementation(async () => ({ send: mockSend, close: mockClose }))

    const runner = new CursorSDKRunner({ timeoutMs: 60_000 })
    const promise = runner.run(baseInvocation, { signal: controller.signal })

    controller.abort()

    await expect(promise).rejects.toThrow()
  })

  it('single rejection: timeout does not cause double-rejection race condition', async () => {
    const rejections: unknown[] = []
    const origUnhandled = process.listeners('unhandledRejection')
    process.on('unhandledRejection', (reason) => rejections.push(reason))

    mockWait.mockImplementation(() => new Promise(() => { }))
    mockSend.mockImplementation(async () => ({ wait: mockWait, cancel: mockCancel }))
    mockCreate.mockImplementation(async () => ({ send: mockSend, close: mockClose }))

    const runner = new CursorSDKRunner({ timeoutMs: 10 })
    const promise = runner.run(baseInvocation)

    await expect(promise).rejects.toThrow()
    // Flush microtasks and any timers
    await new Promise((r) => setTimeout(r, 20))

    expect(rejections).toHaveLength(0)

    process.removeAllListeners('unhandledRejection')
    origUnhandled.forEach((l) => process.on('unhandledRejection', l as any))
  })
})
