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

describe('AntigravityCLIRunner — TC-AGY', () => {
  beforeEach(async () => {
    const { AgentRunnerRegistry } = await import('../../src/agent-runner/AgentRunnerRegistry')
    AgentRunnerRegistry.clear()
    await import('../../src/agent-runner/antigravity-cli/AntigravityCLIRunner')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // TC-AGY-03: self-registers as 'antigravity-cli'
  it('TC-AGY-03: self-registers as "antigravity-cli" on import', async () => {
    const { AgentRunnerRegistry } = await import('../../src/agent-runner/AgentRunnerRegistry')
    expect(AgentRunnerRegistry.has('antigravity-cli')).toBe(true)
  })

  // TC-AGY-01: correct args constructed
  it('TC-AGY-01: correct args constructed and prompt written to stdin', async () => {
    const { spawn } = await import('node:child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    const mockChild = makeMockChild({ stdout: 'gemini response output' })
    spawnMock.mockReturnValue(mockChild)

    const { AntigravityCLIRunner } = await import('../../src/agent-runner/antigravity-cli/AntigravityCLIRunner')
    const runner = new AntigravityCLIRunner()
    const output = await runner.run({
      agent: 'developer-backend',
      mode: 'autonomous',
      payload: {},
      prompt: 'do coding task',
      model: 'gemini-3.5-flash-test',
    })

    expect(spawnMock).toHaveBeenCalledWith(
      'agy',
      ['--print', 'do coding task', '--model', 'gemini-3.5-flash-test', '--print-timeout', '1801000ms'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    )

    expect(mockChild.stdin.write).toHaveBeenCalledWith('do coding task', 'utf8')
    expect(output.raw).toBe('gemini response output')
    expect(output.success).toBe(true)
  })

  // TC-AGY-04: passes non-zero timeoutMs formatted as ms Go-duration
  it('TC-AGY-04: passes non-zero timeoutMs to --print-timeout with ms suffix', async () => {
    const { spawn } = await import('node:child_process')
    const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>
    const mockChild = makeMockChild({ stdout: 'gemini response output' })
    spawnMock.mockReturnValue(mockChild)

    const { AntigravityCLIRunner } = await import('../../src/agent-runner/antigravity-cli/AntigravityCLIRunner')
    const runner = new AntigravityCLIRunner()
    await runner.run({
      agent: 'developer-backend',
      mode: 'autonomous',
      payload: {},
      prompt: 'do coding task',
      model: 'gemini-3.5-flash-test',
      timeoutMs: 30000,
    })

    expect(spawnMock).toHaveBeenCalledWith(
      'agy',
      ['--print', 'do coding task', '--model', 'gemini-3.5-flash-test', '--print-timeout', '31000ms'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
    )
  })
})
