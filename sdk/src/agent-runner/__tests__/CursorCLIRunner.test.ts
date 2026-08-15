import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerFactory } from '../AgentRunnerFactory'
import { AgentRunnerErrorCode } from '../AgentRunnerError'

// ─── Hoisted mock ─────────────────────────────────────────────────────────────
const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }))

vi.mock('cross-spawn', () => ({ default: mockSpawn }))

// ─── Import after mock ────────────────────────────────────────────────────────
import { CursorCLIRunner } from '../cursor-cli/CursorCLIRunner'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeChild(opts: { exitCode?: number; stdout?: string; stderr?: string; enoent?: boolean } = {}) {
  const child = new EventEmitter() as any
  child.pid = 42
  child.kill = vi.fn()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { write: vi.fn(), end: vi.fn() }

  setTimeout(() => {
    if (opts.enoent) {
      const err: NodeJS.ErrnoException = new Error('spawn cursor ENOENT')
      err.code = 'ENOENT'
      child.emit('error', err)
      return
    }
    if (opts.stdout) child.stdout.emit('data', Buffer.from(opts.stdout))
    if (opts.stderr) child.stderr.emit('data', Buffer.from(opts.stderr))
    child.emit('close', opts.exitCode ?? 0)
  }, 0)

  return child
}

const baseInvocation = {
  skill: 'test-skill',
  agent: 'test-agent',
  mode: 'autonomous' as const,
  payload: { key: 'value' },
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('CursorCLIRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers with type "cursor-cli"', () => {
    expect(AgentRunnerRegistry.has('cursor-cli')).toBe(true)
    const runner = AgentRunnerFactory.create({ type: 'cursor-cli' })
    expect(runner).toBeInstanceOf(CursorCLIRunner)
  })

  it('uses "agent" as default binary', () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new CursorCLIRunner()
    runner.run(baseInvocation)
    expect(mockSpawn).toHaveBeenCalledWith('agent', expect.arrayContaining(['--print', '--force']), expect.any(Object))
  })

  it('uses "agent" as binary (no custom bin override via config)', () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new CursorCLIRunner()
    runner.run(baseInvocation)
    expect(mockSpawn).toHaveBeenCalledWith('agent', expect.any(Array), expect.any(Object))
  })

  it('includes --model when model is provided in invocation', () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new CursorCLIRunner()
    runner.run({ ...baseInvocation, model: 'gpt-5' })
    const args = mockSpawn.mock.calls[0][1] as string[]
    expect(args).toContain('--model')
    expect(args[args.indexOf('--model') + 1]).toBe('gpt-5')
  })

  it('uses model from invocation', () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new CursorCLIRunner()
    runner.run({ ...baseInvocation, model: 'claude-opus-4-8' })
    const args = mockSpawn.mock.calls[0][1] as string[]
    expect(args[args.indexOf('--model') + 1]).toBe('claude-opus-4-8')
  })

  it('includes --workspace when workspacePath is provided', () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new CursorCLIRunner()
    runner.run({ ...baseInvocation, workspacePath: '/my/project' })
    const args = mockSpawn.mock.calls[0][1] as string[]
    expect(args).toContain('--workspace')
    expect(args[args.indexOf('--workspace') + 1]).toBe('/my/project')
  })

  it('includes --add-dir for each additionalDir', () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new CursorCLIRunner()
    runner.run({ ...baseInvocation, additionalDirs: ['/a', '/b'] })
    const args = mockSpawn.mock.calls[0][1] as string[]
    const addDirIndexes = args.reduce<number[]>((acc, v, i) => (v === '--add-dir' ? [...acc, i] : acc), [])
    expect(addDirIndexes).toHaveLength(2)
    expect(args[addDirIndexes[0] + 1]).toBe('/a')
    expect(args[addDirIndexes[1] + 1]).toBe('/b')
  })

  it('resolves with success:true on exit code 0', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'hello from cursor' }))
    const runner = new CursorCLIRunner()
    const out = await runner.run(baseInvocation)
    expect(out.success).toBe(true)
    expect(out.stdout).toBe('hello from cursor')
  })

  it('extracts raw from stream-json result line', async () => {
    const jsonLine = JSON.stringify({ type: 'result', result: 'the answer' })
    mockSpawn.mockReturnValue(makeChild({ stdout: jsonLine + '\n' }))
    const runner = new CursorCLIRunner()
    const out = await runner.run(baseInvocation)
    expect(out.raw).toBe('the answer')
  })

  it('falls back to full stdout when no parseable result line', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'plain text output' }))
    const runner = new CursorCLIRunner()
    const out = await runner.run(baseInvocation)
    expect(out.raw).toBe('plain text output')
  })

  it('rejects with NETWORK_ERROR when cursor binary is not found', async () => {
    mockSpawn.mockReturnValue(makeChild({ enoent: true }))
    const runner = new CursorCLIRunner()
    await expect(runner.run(baseInvocation)).rejects.toMatchObject({
      code: AgentRunnerErrorCode.NETWORK_ERROR,
    })
  })

  it('rejects with UNKNOWN_ERROR on non-zero exit', async () => {
    mockSpawn.mockReturnValue(makeChild({ exitCode: 1, stderr: 'fatal error' }))
    const runner = new CursorCLIRunner()
    await expect(runner.run(baseInvocation)).rejects.toMatchObject({
      code: AgentRunnerErrorCode.UNKNOWN_ERROR,
    })
  })

  it('rejects with QUOTA_EXCEEDED on rate-limit stderr', async () => {
    mockSpawn.mockReturnValue(makeChild({ exitCode: 1, stderr: 'rate limit exceeded' }))
    const runner = new CursorCLIRunner()
    await expect(runner.run(baseInvocation)).rejects.toMatchObject({
      code: AgentRunnerErrorCode.QUOTA_EXCEEDED,
    })
  })

  it('rejects with aborted when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new CursorCLIRunner()
    await expect(runner.run(baseInvocation, { signal: controller.signal })).rejects.toThrow('aborted')
  })

  it('times out and kills the process group', async () => {
    const child = new EventEmitter() as any
    child.pid = 99
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = { write: vi.fn(), end: vi.fn() }
    child.kill = vi.fn()
    mockSpawn.mockReturnValue(child)

    const runner = new CursorCLIRunner()
    await expect(runner.run({ ...baseInvocation, timeoutMs: 10 })).rejects.toMatchObject({
      code: AgentRunnerErrorCode.TIMEOUT,
    })
  })

  it('includes --resume when session is provided in invocation', () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new CursorCLIRunner()
    runner.run({ ...baseInvocation, session: { id: 'cursor-sess-123' } })
    const args = mockSpawn.mock.calls[0][1] as string[]
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe('cursor-sess-123')
  })

  it('extracts session from session_id event in stdout', async () => {
    const jsonLine = JSON.stringify({ type: 'assistant', session_id: 'cursor-sess-abc', timestamp_ms: 123456, message: { content: [] } })
    mockSpawn.mockReturnValue(makeChild({ stdout: jsonLine + '\n' }))
    const runner = new CursorCLIRunner()
    const out = await runner.run(baseInvocation)
    expect(out.session).toEqual({ id: 'cursor-sess-abc' })
  })
})
