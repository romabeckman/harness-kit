import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentInvocation } from '../types'
import { CodexCLIRunner } from '../codex-cli/CodexCLIRunner'
import { AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerFactory } from '../AgentRunnerFactory'
import { Runner } from '../types'
import spawn from 'cross-spawn'
import EventEmitter from 'node:events'

vi.mock('cross-spawn', () => ({
  default: vi.fn(),
}))

class MockChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  pid: number | undefined
  kill: ReturnType<typeof vi.fn>

  constructor(
    mockStdout: string[] = [],
    mockStderr: string[] = [],
    exitCode: number = 0,
    error?: NodeJS.ErrnoException,
    opts?: { hang?: boolean },
  ) {
    super()
    this.stdout = new EventEmitter()
    this.stderr = new EventEmitter()
    this.stdin = { write: vi.fn(), end: vi.fn() }
    this.pid = 12345
    this.kill = vi.fn()

    if (error) {
      setTimeout(() => this.emit('error', error), 10)
      return
    }

    if (opts?.hang) {
      return
    }

    let stdoutIndex = 0
    let stderrIndex = 0

    const sendData = () => {
      if (stdoutIndex < mockStdout.length) {
        this.stdout.emit('data', mockStdout[stdoutIndex++])
      }
      if (stderrIndex < mockStderr.length) {
        this.stderr.emit('data', mockStderr[stderrIndex++])
      }

      if (stdoutIndex === mockStdout.length && stderrIndex === mockStderr.length) {
        setTimeout(() => this.emit('close', exitCode), 10)
      } else {
        setTimeout(sendData, 5)
      }
    }
    setTimeout(sendData, 5)
  }
}

describe('CodexCLIRunner', () => {
  let invocation: AgentInvocation
  let mockSpawn: ReturnType<typeof vi.mocked<typeof spawn>>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawn = vi.mocked(spawn)

    invocation = {
      prompt: 'Hello Codex',
      skill: 'test-skill',
      agent: 'test-agent',
      payload: { key: 'value' },
      mode: 'autonomous',
    }
  })

  it('should be registered in AgentRunnerRegistry', () => {
    expect(AgentRunnerRegistry.has(Runner.CODEX_CLI)).toBe(true)
    const runner = AgentRunnerFactory.create({ type: Runner.CODEX_CLI })
    expect(runner).toBeInstanceOf(CodexCLIRunner)
  })

  it('should build correct CLI arguments', () => {
    const runner = new CodexCLIRunner()

    // @ts-ignore - protected method testing
    const args = runner.buildArgs(invocation.prompt, invocation)

    expect(args).toEqual([
      'exec',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
    ])
  })

  it('should include model, working directory, and additional dirs in args when provided', () => {
    const runner = new CodexCLIRunner()
    const fullInvocation: AgentInvocation = {
      ...invocation,
      model: 'o3-mini',
      workspacePath: '/path/to/workspace',
      additionalDirs: ['/extra/dir1', '/extra/dir2'],
    }

    // @ts-ignore - protected method testing
    const args = runner.buildArgs(fullInvocation.prompt, fullInvocation)

    expect(args).toEqual([
      'exec',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
      '--model', 'o3-mini',
      '--cd', '/path/to/workspace',
      '--add-dir', '/extra/dir1',
      '--add-dir', '/extra/dir2',
    ])
  })

  it('should parse streaming JSON events and token usage from codex stdout', async () => {
    const mockOutputLines = [
      '{"type":"thread.started","thread_id":"123"}\n',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Hello response"}}\n',
      '{"type":"turn.completed","usage":{"input_tokens":150,"output_tokens":45,"cache_creation_input_tokens":10,"cache_read_input_tokens":5},"total_cost_usd":0.002}\n',
    ]

    mockSpawn.mockReturnValue(new MockChildProcess(mockOutputLines) as any)

    const runner = new CodexCLIRunner()
    const result = await runner.run(invocation)

    expect(result.success).toBe(true)
    expect(result.raw).toBe('Hello response')
    expect(result.usage).toMatchObject({
      inputTokens: 150,
      outputTokens: 45,
      cacheCreationTokens: 10,
      cacheReadTokens: 5,
      costUsd: 0.002,
    })
  })

  it('should parse real codex CLI output format with cached_input_tokens and cache_write_input_tokens', async () => {
    const mockOutputLines = [
      '{"type":"thread.started","thread_id":"019fdcc2-b0ac-73e2-922d-3f5a496c903e"}\n',
      '{"type":"turn.started"}\n',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Hi! How can I help?"}}\n',
      '{"type":"turn.completed","usage":{"input_tokens":11923,"cached_input_tokens":8960,"cache_write_input_tokens":0,"output_tokens":11,"reasoning_output_tokens":0}}\n',
    ]

    mockSpawn.mockReturnValue(new MockChildProcess(mockOutputLines) as any)

    const runner = new CodexCLIRunner()
    const result = await runner.run(invocation)

    expect(result.success).toBe(true)
    expect(result.raw).toBe('Hi! How can I help?')
    expect(result.usage).toMatchObject({
      inputTokens: 11923,
      outputTokens: 11,
      cacheReadTokens: 8960,
      cacheCreationTokens: 0,
    })
  })

  it('should handle ENOENT error when codex CLI is not found', async () => {
    const mockError: NodeJS.ErrnoException = new Error('spawnSync ENOENT')
    mockError.code = 'ENOENT'

    mockSpawn.mockReturnValue(new MockChildProcess([], [], 1, mockError) as any)

    const runner = new CodexCLIRunner()

    await expect(runner.run(invocation)).rejects.toThrow(
      expect.objectContaining({
        code: AgentRunnerErrorCode.NETWORK_ERROR,
        message: expect.stringContaining('codex CLI not found'),
      })
    )
  })

  it('should handle timeout correctly', async () => {
    mockSpawn.mockReturnValue(new MockChildProcess([], [], 0, undefined, { hang: true }) as any)

    const runner = new CodexCLIRunner()

    await expect(runner.run({ ...invocation, timeoutMs: 50 })).rejects.toThrow(
      expect.objectContaining({
        code: AgentRunnerErrorCode.TIMEOUT,
        message: expect.stringContaining('codex runner timed out'),
      })
    )
  })

  it('should include exec resume <id> in args when invocation.session is provided', () => {
    const runner = new CodexCLIRunner()
    const sessionInvocation: AgentInvocation = {
      ...invocation,
      session: { id: 'thread_abc123' },
    }

    // @ts-ignore - protected method testing
    const args = runner.buildArgs(sessionInvocation.prompt, sessionInvocation)

    expect(args).toEqual([
      'exec',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
      'resume',
      'thread_abc123',
    ])
  })

  it('should extract session from thread_id in output', async () => {
    const mockOutputLines = [
      '{"type":"thread.started","thread_id":"019fdcc2-b0ac-73e2-922d-3f5a496c903e"}\n',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Hi!"}}\n',
    ]

    mockSpawn.mockReturnValue(new MockChildProcess(mockOutputLines) as any)

    const runner = new CodexCLIRunner()
    const result = await runner.run(invocation)

    expect(result.session).toEqual({ id: '019fdcc2-b0ac-73e2-922d-3f5a496c903e' })
  })
})
