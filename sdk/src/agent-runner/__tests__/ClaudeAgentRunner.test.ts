import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { AgentInvocation } from '../types'

// ─── Mock @anthropic-ai/sdk ───────────────────────────────────────────────────
const mockMessagesCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockMessagesCreate },
    })),
    APIStatusError: class APIStatusError extends Error {
      status: number
      constructor(status: number, _body: unknown, message: string, _headers: unknown) {
        super(message)
        this.status = status
        this.name = 'APIStatusError'
      }
    },
    APIConnectionError: class APIConnectionError extends Error {
      constructor({ message }: { message: string }) {
        super(message)
        this.name = 'APIConnectionError'
      }
    },
  }
})

import { ClaudeAgentRunner } from '../claude-agent/ClaudeAgentRunner'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'

// ─── Fixture ──────────────────────────────────────────────────────────────────
const fakeInvocation: AgentInvocation = {
  skill: 'tdd-orchestrator',
  agent: 'developer',
  mode: 'autonomous',
  payload: { featureId: 'F003', taskId: 'T01' },
}

// ─── T03: Constructor ─────────────────────────────────────────────────────────
describe('ClaudeAgentRunner — constructor', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('constructs successfully when ANTHROPIC_API_KEY is set', () => {
    expect(() => new ClaudeAgentRunner()).not.toThrow()
  })

  it('throws AgentRunnerError(MISSING_API_KEY) when env var is absent', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(() => new ClaudeAgentRunner()).toThrow(AgentRunnerError)
  })

  it('throws with code MISSING_API_KEY', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(() => new ClaudeAgentRunner()).toThrow(
      expect.objectContaining({ code: AgentRunnerErrorCode.MISSING_API_KEY })
    )
  })

  it('throws with skill "unknown" during construction', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(() => new ClaudeAgentRunner()).toThrow(
      expect.objectContaining({ skill: 'unknown' })
    )
  })

  it('throws with phase "construction"', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(() => new ClaudeAgentRunner()).toThrow(
      expect.objectContaining({ phase: 'construction' })
    )
  })

  it('throws with cause undefined for MISSING_API_KEY', () => {
    delete process.env.ANTHROPIC_API_KEY
    let caught: unknown
    try {
      new ClaudeAgentRunner()
    } catch (e) {
      caught = e
    }
    expect((caught as AgentRunnerError).cause).toBeUndefined()
  })

  it('throws when ANTHROPIC_API_KEY is empty string', () => {
    process.env.ANTHROPIC_API_KEY = ''
    expect(() => new ClaudeAgentRunner()).toThrow(
      expect.objectContaining({ code: AgentRunnerErrorCode.MISSING_API_KEY })
    )
  })

  it('uses DEFAULT_AGENT_RUNNER_CONFIG when no config provided', () => {
    const runner = new ClaudeAgentRunner()
    expect(runner).toBeDefined()
  })

  it('accepts partial config overrides', () => {
    const runner = new ClaudeAgentRunner({ model: 'claude-opus-4-5' })
    expect(runner).toBeDefined()
  })
})

// ─── T04: Happy Path (TS01) ───────────────────────────────────────────────────
describe('ClaudeAgentRunner.run() — happy path (TS01)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('returns AgentOutput with raw text from single text block', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n{"result":"ok"}\n```' }],
    })
    const runner = new ClaudeAgentRunner()
    const output = await runner.run(fakeInvocation)
    expect(output.raw).toBe('```json\n{"result":"ok"}\n```')
  })

  it('extracts artefacts from JSON in markdown fences (TS01)', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n{"result":"ok"}\n```' }],
    })
    const runner = new ClaudeAgentRunner()
    const output = await runner.run(fakeInvocation)
    expect(output.artefacts).toEqual({ result: 'ok' })
  })

  it('does not throw on successful invocation', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'plain response' }],
    })
    const runner = new ClaudeAgentRunner()
    await expect(runner.run(fakeInvocation)).resolves.toBeDefined()
  })
})

// ─── T05: JSON extraction — markdown fences (TS02) ───────────────────────────
describe('ClaudeAgentRunner.run() — JSON extraction: markdown fences (TS02)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('extracts JSON from markdown fences when preceded by prose', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Analysis complete.\n```json\n{"status":"done","score":"9"}\n```' }],
    })
    const runner = new ClaudeAgentRunner()
    const output = await runner.run(fakeInvocation)
    expect(output.artefacts).toEqual({ status: 'done', score: '9' })
  })

  it('raw output contains full prose and fence (TS02)', async () => {
    const text = 'Analysis complete.\n```json\n{"status":"done","score":"9"}\n```'
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text }] })
    const runner = new ClaudeAgentRunner()
    const output = await runner.run(fakeInvocation)
    expect(output.raw).toBe(text)
  })
})

// ─── T06: JSON extraction — bare JSON (TS03) ─────────────────────────────────
describe('ClaudeAgentRunner.run() — JSON extraction: bare JSON (TS03)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('extracts bare JSON object when no markdown fence present', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Here is the result: {"verdict":"PASS","reason":"all good"}' }],
    })
    const runner = new ClaudeAgentRunner()
    const output = await runner.run(fakeInvocation)
    expect(output.artefacts).toEqual({ verdict: 'PASS', reason: 'all good' })
  })
})

// ─── T07: JSON extraction — no JSON (TS04) ───────────────────────────────────
describe('ClaudeAgentRunner.run() — JSON extraction: no JSON (TS04)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('returns raw text and undefined artefacts when no JSON in response', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'The implementation looks correct.' }],
    })
    const runner = new ClaudeAgentRunner()
    const output = await runner.run(fakeInvocation)
    expect(output.raw).toBe('The implementation looks correct.')
    expect(output.artefacts).toBeUndefined()
  })
})

// ─── T08: Timeout (TS05) ─────────────────────────────────────────────────────
describe('ClaudeAgentRunner.run() — timeout (TS05)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    vi.useRealTimers()
  })

  it('throws AgentRunnerError(TIMEOUT) when request exceeds timeoutMs', async () => {
    const runner = new ClaudeAgentRunner({ timeoutMs: 50 })
    mockMessagesCreate.mockImplementation(() => new Promise(() => {})) // never resolves

    vi.useFakeTimers()
    const runPromise = runner.run(fakeInvocation)
    runPromise.catch(() => {}) // prevent unhandled promise rejection warning
    await vi.advanceTimersByTimeAsync(100)
    vi.useRealTimers()

    await expect(runPromise).rejects.toMatchObject({
      code: AgentRunnerErrorCode.TIMEOUT,
      skill: 'tdd-orchestrator',
      phase: 'dispatch',
    })
  })
})

// ─── T09: API error 4xx/5xx (TS07+TS08) ──────────────────────────────────────
describe('ClaudeAgentRunner.run() — API errors (TS07, TS08)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('throws AgentRunnerError(API_ERROR) for 4xx status (TS07)', async () => {
    const sdk = await import('@anthropic-ai/sdk') as unknown as { APIStatusError: new (status: number, body: unknown, message: string, headers: unknown) => Error & { status: number } }
    const apiError = new sdk.APIStatusError(401, { error: 'Unauthorized' }, 'Unauthorized', {})
    mockMessagesCreate.mockRejectedValue(apiError)
    const runner = new ClaudeAgentRunner()
    await expect(runner.run(fakeInvocation)).rejects.toMatchObject({
      code: AgentRunnerErrorCode.API_ERROR,
      phase: 'dispatch',
      cause: apiError,
    })
  })

  it('throws AgentRunnerError(API_ERROR) for 5xx status (TS08)', async () => {
    const sdk = await import('@anthropic-ai/sdk') as unknown as { APIStatusError: new (status: number, body: unknown, message: string, headers: unknown) => Error & { status: number } }
    const apiError = new sdk.APIStatusError(503, { error: 'Service Unavailable' }, 'Service Unavailable', {})
    mockMessagesCreate.mockRejectedValue(apiError)
    const runner = new ClaudeAgentRunner()
    let caught: AgentRunnerError | undefined
    try {
      await runner.run(fakeInvocation)
    } catch (e) {
      caught = e as AgentRunnerError
    }
    expect(caught?.code).toBe(AgentRunnerErrorCode.API_ERROR)
    expect(caught?.phase).toBe('dispatch')
    expect((caught?.cause as { status: number } | undefined)?.status).toBe(503)
  })
})

// ─── T10: Network failure (TS09) ─────────────────────────────────────────────
describe('ClaudeAgentRunner.run() — network failure (TS09)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('throws AgentRunnerError(NETWORK_ERROR) when connection fails', async () => {
    const { APIConnectionError } = await import('@anthropic-ai/sdk')
    const connError = new APIConnectionError({ message: 'ECONNREFUSED' })
    mockMessagesCreate.mockRejectedValue(connError)
    const runner = new ClaudeAgentRunner()
    await expect(runner.run(fakeInvocation)).rejects.toMatchObject({
      code: AgentRunnerErrorCode.NETWORK_ERROR,
      skill: 'tdd-orchestrator',
      phase: 'dispatch',
      cause: connError,
    })
  })
})

// ─── T11: Custom model config (TS10) ─────────────────────────────────────────
describe('ClaudeAgentRunner.run() — custom model config (TS10)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('passes the configured model to messages.create', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'done' }] })
    const runner = new ClaudeAgentRunner({ model: 'claude-opus-4-5' })
    await runner.run(fakeInvocation)
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-5' }),
      expect.objectContaining({ signal: expect.anything() })
    )
  })
})

// ─── T12: Empty response (TS11) ──────────────────────────────────────────────
describe('ClaudeAgentRunner.run() — empty response (TS11)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('returns empty raw string and no artefacts when API returns empty text', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: '' }] })
    const runner = new ClaudeAgentRunner()
    const output = await runner.run(fakeInvocation)
    expect(output.raw).toBe('')
    expect(output.artefacts).toBeUndefined()
  })
})

// ─── T13: Large response (TS12) + error fields completeness (TS13) ────────────
describe('ClaudeAgentRunner.run() — large response (TS12)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('returns 100KB response without truncation', async () => {
    const largeString = 'x'.repeat(102400)
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: largeString }] })
    const runner = new ClaudeAgentRunner()
    const output = await runner.run(fakeInvocation)
    expect(output.raw.length).toBeGreaterThan(50000)
    expect(output.raw).toBe(largeString)
  })
})

describe('AgentRunnerError fields completeness (TS13)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockMessagesCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    vi.useRealTimers()
  })

  it('TS13-A: TIMEOUT error has all required fields', async () => {
    const runner = new ClaudeAgentRunner({ timeoutMs: 50 })
    mockMessagesCreate.mockImplementation(() => new Promise(() => {}))

    vi.useFakeTimers()
    const runPromise = runner.run(fakeInvocation)
    runPromise.catch(() => {}) // prevent unhandled promise rejection warning
    await vi.advanceTimersByTimeAsync(100)
    vi.useRealTimers()

    let error: AgentRunnerError | undefined
    try {
      await runPromise
    } catch (e) {
      error = e as AgentRunnerError
    }
    expect(error).toBeInstanceOf(AgentRunnerError)
    expect(error?.name).toBe('AgentRunnerError')
    expect(error?.code).toBe(AgentRunnerErrorCode.TIMEOUT)
    expect(error?.skill).toBe('tdd-orchestrator')
    expect(error?.phase).toBe('dispatch')
    expect(error?.cause).toBeDefined()
    expect(error?.message).not.toBe('')
  })

  it('TS13-B: API_ERROR has all required fields', async () => {
    const sdk = await import('@anthropic-ai/sdk') as unknown as { APIStatusError: new (status: number, body: unknown, message: string, headers: unknown) => Error & { status: number } }
    const apiError = new sdk.APIStatusError(429, {}, 'Too Many Requests', {})
    mockMessagesCreate.mockRejectedValue(apiError)
    const runner = new ClaudeAgentRunner()

    let error: AgentRunnerError | undefined
    try {
      await runner.run(fakeInvocation)
    } catch (e) {
      error = e as AgentRunnerError
    }
    expect(error).toBeInstanceOf(AgentRunnerError)
    expect(error?.name).toBe('AgentRunnerError')
    expect(error?.code).toBe(AgentRunnerErrorCode.API_ERROR)
    expect(error?.skill).toBe('tdd-orchestrator')
    expect(error?.phase).toBe('dispatch')
    expect(error?.cause).toBeInstanceOf(Error)
    expect(error?.message).not.toBe('')
  })

  it('TS13-C: MISSING_API_KEY has all required fields', () => {
    delete process.env.ANTHROPIC_API_KEY
    let error: AgentRunnerError | undefined
    try {
      new ClaudeAgentRunner()
    } catch (e) {
      error = e as AgentRunnerError
    }
    expect(error).toBeInstanceOf(AgentRunnerError)
    expect(error?.name).toBe('AgentRunnerError')
    expect(error?.code).toBe(AgentRunnerErrorCode.MISSING_API_KEY)
    expect(error?.skill).toBe('unknown')
    expect(error?.phase).toBe('construction')
    expect(error?.cause).toBeUndefined()
    expect(error?.message).not.toBe('')
  })
})
