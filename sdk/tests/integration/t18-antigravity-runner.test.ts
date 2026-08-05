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
    const { AgentRunnerRegistry } = await import('../../src/agent-runner/AgentRunnerRegistry.js')
    AgentRunnerRegistry.clear()
    await import('../../src/agent-runner/antigravity-cli/AntigravityCLIRunner.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // TC-AGY-03: self-registers as 'antigravity-cli'
  it('TC-AGY-03: self-registers as "antigravity-cli" on import', async () => {
    const { AgentRunnerRegistry } = await import('../../src/agent-runner/AgentRunnerRegistry.js')
    expect(AgentRunnerRegistry.has('antigravity-cli')).toBe(true)
  })
})
