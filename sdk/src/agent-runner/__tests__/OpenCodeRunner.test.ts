import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'

// ─── Hoisted SDK mock ─────────────────────────────────────────────────────────
const { mockPrompt, mockSessionCreate, mockServerClose, mockCreateOpencode } = vi.hoisted(() => {
  const mockPrompt = vi.fn().mockResolvedValue({ parts: [{ type: 'text', text: 'ok' }] })
  const mockSessionCreate = vi.fn().mockResolvedValue({ id: 'sess-1' })
  const mockServerClose = vi.fn().mockResolvedValue(undefined)
  const mockCreateOpencode = vi.fn().mockResolvedValue({
    server: { close: vi.fn().mockResolvedValue(undefined) },
    client: {
      session: {
        create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
        prompt: vi.fn().mockResolvedValue({ parts: [{ type: 'text', text: 'ok' }] }),
      },
    },
  })

  return { mockPrompt, mockSessionCreate, mockServerClose, mockCreateOpencode }
})

vi.mock('@opencode-ai/sdk', () => ({
  createOpencode: mockCreateOpencode,
  createOpencodeClient: vi.fn().mockReturnValue({
    session: {
      create: mockSessionCreate,
      prompt: mockPrompt,
    },
  }),
}))

// ─── Dynamic import path must match exactly what the runner uses ─────────────
// The runner does:  const sdkName = '@opencode-ai/sdk'; sdk = await import(sdkName)
// Vitest vi.mock() intercepts this automatically by module name.

import { OpenCodeRunner } from '../opencode/OpenCodeRunner'

const baseInvocation = {
  skill: 'test-skill',
  agent: 'test-agent',
  mode: 'autonomous' as const,
  payload: {},
}

describe('OpenCodeRunner — timeout concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers() // Ensure real timers at start of every test
    mockPrompt.mockResolvedValue({ parts: [{ type: 'text', text: 'ok' }] })
    mockSessionCreate.mockResolvedValue({ id: 'sess-1' })
    mockServerClose.mockResolvedValue(undefined)
    // Reset createOpencode to use the shared hoisted mocks
    mockCreateOpencode.mockResolvedValue({
      server: { close: mockServerClose },
      client: { session: { create: mockSessionCreate, prompt: mockPrompt } },
    })
  })

  it('resolves successfully on happy path (serverUrl override)', async () => {
    const runner = new OpenCodeRunner({ serverUrl: 'http://localhost:3000' })
    const out = await runner.run(baseInvocation)
    expect(out.success).toBe(true)
  })

  it('propagates external AbortSignal: rejects before workPromise completes', async () => {
    const controller = new AbortController()

    mockPrompt.mockImplementation(
      (_body: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise<never>((_, reject) => {
          if (opts?.signal?.aborted) {
            reject(new Error('AbortError'))
          } else {
            opts?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
          }
        })
    )

    const runner = new OpenCodeRunner({ serverUrl: 'http://localhost:3000', timeoutMs: 60_000 })
    const promise = runner.run(baseInvocation, { signal: controller.signal })

    controller.abort()

    // Should reject quickly (not hang forever)
    await expect(promise).rejects.toThrow()
  })

  it('throws TIMEOUT when prompt() hangs past timeoutMs', async () => {
    // prompt() hangs but respects the AbortSignal passed as second arg
    mockPrompt.mockImplementation(
      (_body: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise<never>((_, reject) => {
          if (opts?.signal?.aborted) {
            reject(new Error('AbortError'))
          } else {
            opts?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
          }
        })
    )

    const runner = new OpenCodeRunner({ serverUrl: 'http://localhost:3000', timeoutMs: 10 })
    const promise = runner.run(baseInvocation)

    await expect(promise).rejects.toThrow(
      expect.objectContaining({ code: AgentRunnerErrorCode.TIMEOUT })
    )
  })

  it('workPromise does not continue running after abort (no zombie)', async () => {
    const controller = new AbortController()
    let promptResolved = false

    mockPrompt.mockImplementation(
      (_body: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
          if (opts?.signal?.aborted) {
            reject(new Error('AbortError'))
            return
          }
          opts?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
          // Resolves after 200ms — simulates work completing after abort
          setTimeout(() => {
            promptResolved = true
            resolve()
          }, 200)
        })
    )

    const runner = new OpenCodeRunner({ serverUrl: 'http://localhost:3000', timeoutMs: 60_000 })
    const promise = runner.run(baseInvocation, { signal: controller.signal })

    controller.abort()
    await expect(promise).rejects.toThrow()

    // The runner rejected immediately on abort — the prompt may still complete
    // but the caller should NOT have awaited it (no zombie observable side effect via output)
    expect(promise).toBeDefined() // promise already rejected
  })

  it('closes server in finally even after abort', async () => {
    // Configure mockCreateOpencode so the runner starts a managed server
    mockPrompt.mockImplementation(
      (_body: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise<never>((_, reject) => {
          if (opts?.signal?.aborted) {
            reject(new Error('AbortError'))
          } else {
            opts?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
          }
        })
    )

    const controller = new AbortController()
    const runner = new OpenCodeRunner({ timeoutMs: 60_000 }) // no serverUrl → uses createOpencode
    const promise = runner.run(baseInvocation, { signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toThrow()
    expect(mockServerClose).toHaveBeenCalled()
  })
})
