import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockWait = vi.fn()
const mockSend = vi.fn()
const mockClose = vi.fn()
const mockAgentCreate = vi.fn()

vi.mock('@cursor/sdk', () => ({
  Agent: {
    create: (...args: any[]) => mockAgentCreate(...args),
  },
}))

describe('CursorRunner — TC-CU', () => {
  beforeEach(async () => {
    mockWait.mockReset()
    mockSend.mockReset()
    mockClose.mockReset()
    mockAgentCreate.mockReset()

    mockWait.mockResolvedValue({
      status: 'finished',
      result: 'cursor response text',
    })
    mockSend.mockResolvedValue({
      wait: mockWait,
      cancel: vi.fn(),
    })
    mockAgentCreate.mockResolvedValue({
      send: mockSend,
      close: mockClose,
    })

    await import('../../src/agent-runner/cursor/CursorRunner')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('TC-CU-03: self-registers as "cursor" on import', async () => {
    const { AgentRunnerRegistry } = await import('../../src/agent-runner/AgentRunnerRegistry')
    expect(AgentRunnerRegistry.has('cursor')).toBe(true)
  })

  it('TC-CU-01: correct configuration passed to Agent.create', async () => {
    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const original = process.env.CURSOR_API_KEY
    process.env.CURSOR_API_KEY = 'test-cursor-key'

    try {
      const runner = new CursorRunner()
      const output = await runner.run({
        agent: 'developer-backend',
        mode: 'autonomous',
        payload: { test: true },
        prompt: 'refactor auth module',
      })

      expect(mockAgentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-cursor-key',
          model: {
            id: 'composer-2.5',
            params: [],
          },
          local: {
            cwd: process.cwd(),
          },
        })
      )

      expect(mockSend).toHaveBeenCalledWith('refactor auth module')
      expect(output.success).toBe(true)
      expect(output.raw).toBe('cursor response text')
      expect(output.stdout).toBe('cursor response text')
      expect(mockClose).toHaveBeenCalled()
    } finally {
      if (original !== undefined) process.env.CURSOR_API_KEY = original
      else delete process.env.CURSOR_API_KEY
    }
  })

  it('TC-CU-01b: forwards reasoning-effort parameter to Agent.create model params', async () => {
    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const original = process.env.CURSOR_API_KEY
    process.env.CURSOR_API_KEY = 'test-cursor-key'

    try {
      const runner = new CursorRunner()
      await runner.run({
        agent: 'developer-backend',
        mode: 'autonomous',
        payload: {},
        prompt: 'task',
        effort: 'high',
      })

      expect(mockAgentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: {
            id: 'composer-2.5',
            params: [{ id: 'reasoning-effort', value: 'high' }],
          },
        })
      )
    } finally {
      if (original !== undefined) process.env.CURSOR_API_KEY = original
      else delete process.env.CURSOR_API_KEY
    }
  })

  it('TC-CU-02: validateConfig throws MISSING_API_KEY when CURSOR_API_KEY absent', async () => {
    const { AgentRunnerFactory } = await import('../../src/agent-runner/AgentRunnerFactory')
    const { AgentRunnerError, AgentRunnerErrorCode } = await import('../../src/agent-runner/AgentRunnerError')

    const original = process.env.CURSOR_API_KEY
    delete process.env.CURSOR_API_KEY

    try {
      let caught: unknown
      try { AgentRunnerFactory.create({ type: 'cursor' }) }
      catch (e) { caught = e }

      expect(caught).toBeInstanceOf(AgentRunnerError)
      expect((caught as InstanceType<typeof AgentRunnerError>).code).toBe(AgentRunnerErrorCode.MISSING_API_KEY)
    } finally {
      if (original !== undefined) process.env.CURSOR_API_KEY = original
    }
  })

  it('TC-CU-02b: validateConfig passes when CURSOR_API_KEY is set', async () => {
    const { AgentRunnerFactory } = await import('../../src/agent-runner/AgentRunnerFactory')
    const original = process.env.CURSOR_API_KEY
    process.env.CURSOR_API_KEY = 'test-cursor-key'

    try {
      expect(() => AgentRunnerFactory.create({ type: 'cursor' })).not.toThrow()
    } finally {
      if (original !== undefined) process.env.CURSOR_API_KEY = original
      else delete process.env.CURSOR_API_KEY
    }
  })

  it('TC-CU-04: throws AgentRunnerError(UNKNOWN_ERROR) when run status is error', async () => {
    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const { AgentRunnerError, AgentRunnerErrorCode } = await import('../../src/agent-runner/AgentRunnerError')

    mockWait.mockResolvedValue({
      status: 'error',
    })

    const original = process.env.CURSOR_API_KEY
    process.env.CURSOR_API_KEY = 'test-cursor-key'

    try {
      const runner = new CursorRunner()
      let caught: unknown
      try {
        await runner.run({
          agent: 'developer-backend',
          mode: 'autonomous',
          payload: {},
          prompt: 'task',
        })
      } catch (e) {
        caught = e
      }

      expect(caught).toBeInstanceOf(AgentRunnerError)
      expect((caught as InstanceType<typeof AgentRunnerError>).code).toBe(AgentRunnerErrorCode.UNKNOWN_ERROR)
    } finally {
      if (original !== undefined) process.env.CURSOR_API_KEY = original
      else delete process.env.CURSOR_API_KEY
    }
  })

  it('TC-CU-05: timeout throws AgentRunnerError(TIMEOUT)', async () => {
    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const { AgentRunnerError, AgentRunnerErrorCode } = await import('../../src/agent-runner/AgentRunnerError')

    mockWait.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ status: 'finished', result: 'done' }), 200)))

    const original = process.env.CURSOR_API_KEY
    process.env.CURSOR_API_KEY = 'test-cursor-key'

    try {
      const runner = new CursorRunner({ timeoutMs: 50 })
      let caught: unknown
      try {
        await runner.run({
          agent: 'developer-backend',
          mode: 'autonomous',
          payload: {},
          prompt: 'task',
        })
      } catch (e) {
        caught = e
      }

      expect(caught).toBeInstanceOf(AgentRunnerError)
      expect((caught as InstanceType<typeof AgentRunnerError>).code).toBe(AgentRunnerErrorCode.TIMEOUT)
    } finally {
      if (original !== undefined) process.env.CURSOR_API_KEY = original
      else delete process.env.CURSOR_API_KEY
    }
  })

  it('TC-CU-06: AbortSignal rejects run() and cancels the run', async () => {
    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const original = process.env.CURSOR_API_KEY
    process.env.CURSOR_API_KEY = 'test-cursor-key'

    const mockCancel = vi.fn().mockResolvedValue(undefined)
    mockSend.mockResolvedValue({
      wait: () => new Promise((resolve) => setTimeout(() => resolve({ status: 'finished', result: 'done' }), 200)),
      cancel: mockCancel,
    })

    try {
      const runner = new CursorRunner()
      const controller = new AbortController()

      const runPromise = runner.run(
        { agent: 'dev', mode: 'autonomous', payload: {}, prompt: 'task' },
        { signal: controller.signal },
      )

      setTimeout(() => controller.abort(), 20)

      await expect(runPromise).rejects.toThrow('aborted')
      expect(mockCancel).toHaveBeenCalled()
    } finally {
      if (original !== undefined) process.env.CURSOR_API_KEY = original
      else delete process.env.CURSOR_API_KEY
    }
  })
})
