import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerFactory } from '../AgentRunnerFactory'
import { CopilotCLIRunner } from '../copilot-cli/CopilotCLIRunner'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import spawn from 'cross-spawn'

vi.mock('cross-spawn', () => ({
  default: vi.fn(),
}))

// Controllable mock child process
function createMockChild(options?: { pid?: number }) {
  const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {}
  const stdoutHandlers: Array<(data: unknown) => void> = []
  const stderrHandlers: Array<(data: unknown) => void> = []

  const mockChild = {
    pid: options?.pid ?? 1234,
    stdout: {
      on: vi.fn((event: string, cb: (data: unknown) => void) => {
        if (event === 'data') stdoutHandlers.push(cb)
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (data: unknown) => void) => {
        if (event === 'data') stderrHandlers.push(cb)
      }),
    },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!eventHandlers[event]) eventHandlers[event] = []
      eventHandlers[event].push(cb)
    }),
    kill: vi.fn(),
    _emit: (event: string, ...args: unknown[]) => {
      eventHandlers[event]?.forEach(cb => cb(...args))
    },
    _emitStdout: (data: string) => {
      stdoutHandlers.forEach(cb => cb(Buffer.from(data)))
    },
    _emitStderr: (data: string) => {
      stderrHandlers.forEach(cb => cb(Buffer.from(data)))
    },
  }
  return mockChild
}

describe('CopilotCLIRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // TS01 — Registry and Factory Integration
  it('TS01 — registers as copilot-cli and AgentRunnerFactory creates instance', () => {
    expect(AgentRunnerRegistry.has('copilot-cli')).toBe(true)

    const runner = AgentRunnerFactory.create({ type: 'copilot-cli' })
    expect(runner).toBeInstanceOf(CopilotCLIRunner)
  })

  // TS02 — buildArgs: base flags always present
  it('TS02 — buildArgs always includes --prompt and --allow-all', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'do something' })

    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      'copilot',
      expect.arrayContaining(['--prompt', 'do something', '--allow-all']),
      expect.any(Object),
    )

    mockChild._emit('close', 0)
    await promise
  })

  // TS03 — buildArgs: model flag from invocation
  it('TS03 — buildArgs includes --model when invocation provides model', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x', model: 'gpt-4o' })

    const [, args] = vi.mocked(spawn).mock.calls[0]
    expect(args).toContain('--model')
    const modelIdx = (args as string[]).indexOf('--model')
    expect((args as string[])[modelIdx + 1]).toBe('gpt-4o')

    mockChild._emit('close', 0)
    await promise
  })

  // TS04 — buildArgs: invocation.model overrides config model
  it('TS04 — invocation.model overrides config model', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x', model: 'o3' })

    const [, args] = vi.mocked(spawn).mock.calls[0]
    const spawnArgs = args as string[]
    const modelIdx = spawnArgs.indexOf('--model')
    expect(modelIdx).toBeGreaterThan(-1)
    expect(spawnArgs[modelIdx + 1]).toBe('o3')
    expect(spawnArgs).not.toContain('gpt-4o')

    mockChild._emit('close', 0)
    await promise
  })

  // TS05 — buildArgs: reasoning-effort flag from invocation.effort
  it('TS05 — buildArgs adds --reasoning-effort when invocation.effort set', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x', effort: 'high' })

    const [, args] = vi.mocked(spawn).mock.calls[0]
    expect(args).toContain('--reasoning-effort')
    const effortIdx = (args as string[]).indexOf('--reasoning-effort')
    expect((args as string[])[effortIdx + 1]).toBe('high')

    mockChild._emit('close', 0)
    await promise
  })

  // TS06 — buildArgs: no model/effort flags when both absent
  it('TS06 — no --model or --reasoning-effort when both absent; --prompt and --allow-all present', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x' })

    const [, args] = vi.mocked(spawn).mock.calls[0]
    expect(args).not.toContain('--model')
    expect(args).not.toContain('--reasoning-effort')
    expect(args).toContain('--prompt')
    expect(args).toContain('--allow-all')

    mockChild._emit('close', 0)
    await promise
  })

  // TS07 — Successful execution resolves with stdout
  it('TS07 — successful spawn resolves with stdout and success=true', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x' })

    mockChild._emitStdout('hello from copilot\n')
    mockChild._emit('close', 0)

    const result = await promise
    expect(result.success).toBe(true)
    expect(result.stdout).toBe('hello from copilot\n')
    expect(result.raw).toBe('hello from copilot\n')
  })

  // TS08 — ENOENT throws NETWORK_ERROR
  it('TS08 — ENOENT error event rejects with NETWORK_ERROR containing copilot and not found', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x' })

    const err = Object.assign(new Error('spawn copilot ENOENT'), { code: 'ENOENT' })
    mockChild._emit('error', err)

    await expect(promise).rejects.toMatchObject({
      code: AgentRunnerErrorCode.NETWORK_ERROR,
    })

    const caught = await promise.catch(e => e)
    expect(caught).toBeInstanceOf(AgentRunnerError)
    expect(caught.message).toMatch(/copilot/i)
    expect(caught.message).toMatch(/not found/i)
  })

  // TS09 — Non-zero exit code throws UNKNOWN_ERROR
  it('TS09 — non-zero exit with generic stderr rejects with UNKNOWN_ERROR', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x' })

    mockChild._emitStderr('something went wrong')
    mockChild._emit('close', 1)

    await expect(promise).rejects.toMatchObject({
      code: AgentRunnerErrorCode.UNKNOWN_ERROR,
    })
  })

  // TS10 — Rate-limit detection on non-zero exit
  it('TS10 — non-zero exit with rate limit stderr rejects with QUOTA_EXCEEDED', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x' })

    mockChild._emitStderr('rate limit exceeded')
    mockChild._emit('close', 1)

    await expect(promise).rejects.toMatchObject({
      code: AgentRunnerErrorCode.QUOTA_EXCEEDED,
    })
  })

  // TS11 — AbortSignal cancels execution
  it('TS11 — aborting signal rejects with /aborted/i and calls kill', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const controller = new AbortController()
    const runner = new CopilotCLIRunner()
    const promise = runner.run(
      { agent: 'a', mode: 'autonomous', prompt: 'x' },
      { signal: controller.signal },
    )

    controller.abort()

    await expect(promise).rejects.toThrow(/aborted/i)
    if (process.platform === 'win32') {
      expect(spawn).toHaveBeenCalledWith('taskkill', expect.any(Array))
    } else {
      expect(mockChild.kill).toHaveBeenCalled()
    }
  })

  // TS12 — Timeout kills process and rejects with TIMEOUT
  it('TS12 — timeout rejects with TIMEOUT after timeoutMs elapses', async () => {
    vi.useFakeTimers()

    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x', timeoutMs: 100 })
    promise.catch(() => { /* suppress unhandled */ })

    await vi.advanceTimersByTimeAsync(150)

    await expect(promise).rejects.toMatchObject({
      code: AgentRunnerErrorCode.TIMEOUT,
    })

    vi.useRealTimers()
  })

  it('TS13 — buildArgs includes --resume when invocation provides session', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x', session: { id: 'copilot-sess-456' } })

    const [, args] = vi.mocked(spawn).mock.calls[0]
    expect(args).toContain('--resume')
    const resumeIdx = (args as string[]).indexOf('--resume')
    expect((args as string[])[resumeIdx + 1]).toBe('copilot-sess-456')

    mockChild._emit('close', 0)
    await promise
  })

  it('TS14 — extracts session from session_id event in stdout', async () => {
    const mockChild = createMockChild()
    vi.mocked(spawn).mockReturnValue(mockChild as any)

    const runner = new CopilotCLIRunner()
    const promise = runner.run({ agent: 'a', mode: 'autonomous', prompt: 'x' })

    mockChild._emitStdout('{"type":"session","session_id":"copilot-sess-789"}\n{"type":"result","exitCode":0}\n')
    mockChild._emit('close', 0)

    const result = await promise
    expect(result.session).toEqual({ id: 'copilot-sess-789' })
  })
})
