import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// ─── spawn mock helpers ───────────────────────────────────────────────────────
function makeMockChild(opts: {
  stdout?: string
  stderr?: string
  exitCode?: number
  errorCode?: string
  delay?: number
}) {
  const child = new EventEmitter() as any
  child.stdin = { write: vi.fn(), end: vi.fn() }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = 12345
  child.kill = vi.fn()

  setImmediate(() => {
    if (opts.errorCode) {
      const err: any = new Error('spawn error')
      err.code = opts.errorCode
      child.emit('error', err)
      return
    }
    if (opts.stdout) child.stdout.emit('data', Buffer.from(opts.stdout))
    if (opts.stderr) child.stderr.emit('data', Buffer.from(opts.stderr))
    setTimeout(() => {
      child.emit('close', opts.exitCode ?? 0)
    }, opts.delay ?? 0)
  })

  return child
}

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

describe('CursorRunner — TC-CU', () => {
  // Import registrations and classes inside beforeEach after clearing registry
  // to avoid cross-test registry pollution from singleton state.

  beforeEach(async () => {
    // Import spawn mock and reset call history
    const { spawn } = await import('node:child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockReset()

    // Ensure CursorRunner is imported and registered
    await import('../../src/agent-runner/cursor/CursorRunner')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // TC-CU-03: self-registers as 'cursor'
  it('TC-CU-03: self-registers as "cursor" on import', async () => {
    const { AgentRunnerRegistry } = await import('../../src/agent-runner/AgentRunnerRegistry')
    expect(AgentRunnerRegistry.has('cursor')).toBe(true)
  })

  // TC-CU-01: correct args constructed (json output)
  it('TC-CU-01: correct args constructed with json output format', async () => {
    const { spawn } = await import('node:child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockReturnValue(makeMockChild({ stdout: 'agent output' }))

    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const runner = new CursorRunner({ outputFormat: 'json' })
    await runner.run({
      agent: 'developer-backend',
      mode: 'autonomous',
      payload: {},
      prompt: 'refactor auth module',
    })

    expect(spawnMock).toHaveBeenCalledWith(
      'cursor-agent',
      ['refactor auth module', '--print', '--force', '--approve-mcps', '--output-format', 'json'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    )
  })

  it('TC-CU-01b: returns AgentOutput with raw = stdout', async () => {
    const { spawn } = await import('node:child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockReturnValue(makeMockChild({ stdout: 'cursor response text' }))

    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const runner = new CursorRunner()
    const output = await runner.run({
      agent: 'developer-backend',
      mode: 'autonomous',
      payload: {},
      prompt: 'write docs',
    })

    expect(output.raw).toBe('cursor response text')
    expect(output.success).toBe(true)
  })

  // TC-CU-02: validateConfig throws when CURSOR_API_KEY absent
  it('TC-CU-02: validateConfig throws MISSING_API_KEY when CURSOR_API_KEY absent', async () => {
    // Import Factory AFTER runner is registered (runner already imported in beforeEach)
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
      expect((caught as InstanceType<typeof AgentRunnerError>).message).toContain('CURSOR_API_KEY')
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

  // AbstractCliRunner shared behaviour via CursorRunner
  it('TC-ACR-02: ENOENT throws AgentRunnerError(NETWORK_ERROR)', async () => {
    const { spawn } = await import('node:child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockReturnValue(makeMockChild({ errorCode: 'ENOENT' }))

    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const { AgentRunnerError, AgentRunnerErrorCode } = await import('../../src/agent-runner/AgentRunnerError')

    const runner = new CursorRunner()
    let caught: unknown
    try { await runner.run({ agent: 'dev', mode: 'autonomous', payload: {}, prompt: 'task' }) }
    catch (e) { caught = e }

    expect(caught).toBeInstanceOf(AgentRunnerError)
    expect((caught as InstanceType<typeof AgentRunnerError>).code).toBe(AgentRunnerErrorCode.NETWORK_ERROR)
  })

  it('TC-ACR-03: exit code ≠ 0 throws AgentRunnerError(API_ERROR)', async () => {
    const { spawn } = await import('node:child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockReturnValue(makeMockChild({ exitCode: 1 }))

    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const { AgentRunnerError, AgentRunnerErrorCode } = await import('../../src/agent-runner/AgentRunnerError')

    const runner = new CursorRunner()
    let caught: unknown
    try { await runner.run({ agent: 'dev', mode: 'autonomous', payload: {}, prompt: 'task' }) }
    catch (e) { caught = e }

    expect(caught).toBeInstanceOf(AgentRunnerError)
    expect((caught as InstanceType<typeof AgentRunnerError>).code).toBe(AgentRunnerErrorCode.API_ERROR)
  })

  it('TC-ACR-04: AbortSignal rejects run()', async () => {
    const { spawn } = await import('node:child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockReturnValue(makeMockChild({ delay: 5000 }))

    const { CursorRunner } = await import('../../src/agent-runner/cursor/CursorRunner')
    const runner = new CursorRunner()
    const controller = new AbortController()
    const runPromise = runner.run(
      { agent: 'dev', mode: 'autonomous', payload: {}, prompt: 'task' },
      { signal: controller.signal },
    )

    setImmediate(() => controller.abort())
    await expect(runPromise).rejects.toThrow('aborted')
  })
})
