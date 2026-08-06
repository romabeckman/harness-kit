import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerFactory } from '../AgentRunnerFactory'
import { AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentInvocation } from '../types'

// ─── Hoisted mock ─────────────────────────────────────────────────────────────
const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }))

vi.mock('cross-spawn', () => ({ default: mockSpawn }))

// ─── Import after mock ────────────────────────────────────────────────────────
import { KiroCLIRunner } from '../kiro-cli/KiroCLIRunner'

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
      const err: NodeJS.ErrnoException = new Error('spawn kiro-cli ENOENT')
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

const baseInvocation: AgentInvocation = {
  skill: 'test-skill',
  agent: 'test-agent',
  mode: 'autonomous',
  payload: { key: 'value' },
  prompt: 'Hello Kiro',
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('KiroCLIRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers with type "kiro-cli"', () => {
    expect(AgentRunnerRegistry.has('kiro-cli')).toBe(true)
    const runner = AgentRunnerFactory.create({ type: 'kiro-cli' })
    expect(runner).toBeInstanceOf(KiroCLIRunner)
  })

  it('uses "kiro-cli" as binary name and builds correct args', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new KiroCLIRunner()

    // @ts-ignore - protected method access
    const args = runner.buildArgs(baseInvocation.prompt, baseInvocation)
    expect(args).toEqual([
      'chat',
      '--no-interactive',
      '--trust-all-tools',
      '--agent', 'test-agent',
    ])
  })

  it('passes model and effort flags when specified', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'ok' }))
    const runner = new KiroCLIRunner()
    const invocation: AgentInvocation = {
      ...baseInvocation,
      model: 'claude-3-5-sonnet',
      effort: 'high',
    }

    // @ts-ignore
    const args = runner.buildArgs(invocation.prompt, invocation)
    expect(args).toContain('--model')
    expect(args[args.indexOf('--model') + 1]).toBe('claude-3-5-sonnet')
    expect(args).toContain('--effort')
    expect(args[args.indexOf('--effort') + 1]).toBe('high')
  })

  it('correctly parses JSON output with result and usage', async () => {
    const mockOutputLines = [
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Working..."}]}}\n',
      '{"type":"result","subtype":"success","result":"Completed task","usage":{"input_tokens":150,"output_tokens":60,"cache_creation_input_tokens":20,"cache_read_input_tokens":10},"total_cost_usd":0.002,"modelUsage":{"claude-3-5-sonnet":{"input":150,"output":60}}}\n',
    ].join('')

    mockSpawn.mockReturnValue(makeChild({ stdout: mockOutputLines }))
    const runner = new KiroCLIRunner()
    const result = await runner.run(baseInvocation)

    expect(result.success).toBe(true)
    expect(result.raw).toBe('Completed task')
    expect(result.usage).toMatchObject({
      inputTokens: 150,
      outputTokens: 60,
      cacheCreationTokens: 20,
      cacheReadTokens: 10,
      costUsd: 0.002,
      model: 'claude-3-5-sonnet',
    })
  })

  it('handles ENOENT when kiro-cli binary is not found', async () => {
    mockSpawn.mockReturnValue(makeChild({ enoent: true }))
    const runner = new KiroCLIRunner()

    await expect(runner.run(baseInvocation)).rejects.toMatchObject({
      code: AgentRunnerErrorCode.NETWORK_ERROR,
      message: expect.stringContaining('kiro-cli CLI not found'),
    })
  })
})
