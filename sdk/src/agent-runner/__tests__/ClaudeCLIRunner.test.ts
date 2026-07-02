import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentInvocation, AgentOutput } from '../types'
import { ClaudeCLIRunner } from '../claude-cli/ClaudeCLIRunner'
import { AgentRunnerErrorCode } from '../AgentRunnerError'
import { spawn } from 'node:child_process'
import EventEmitter from 'node:events'

// Mock the child_process module
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

class MockChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: vi.Mock, end: vi.Mock }
  pid: number | undefined
  kill: vi.Mock

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
      // Never emits 'close' — used to let the runner's own timeout fire
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

describe('ClaudeCLIRunner', () => {
  let invocation: AgentInvocation
  let mockSpawn: ReturnType<typeof vi.mocked<typeof spawn>>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawn = vi.mocked(spawn)

    invocation = {
      prompt: 'Hello Claude',
      skill: 'test-skill',
      payload: { key: 'value' },
      mode: 'default',
    }
  })

  // Test for buildArgs method (will be added after refactoring to extend AbstractCliRunner)
  it('should build correct CLI arguments based on invocation and config', async () => {
    const runner = new ClaudeCLIRunner({ claudeBin: 'test-claude-bin' })

    // @ts-ignore - access protected method for testing
    const args = runner.buildArgs(invocation.prompt, invocation)

    // prompt is sent via stdin, not as a positional arg
    expect(args).toEqual([
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--input-format', 'text',
      '--dangerously-skip-permissions',
    ])
  })

  // Test for token usage parsing
  it('should correctly parse token usage from stream-json output', async () => {
    const mockOutputLines = [
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Thinking..."}]}}\n',
      '{"type":"result","subtype":"success","result":"Final Answer","usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":10,"cache_read_input_tokens":5},"total_cost_usd":0.001,"modelUsage":{"claude-opus-4-8":{"input":100,"output":50}}}\n',
    ]

    mockSpawn.mockReturnValue(new MockChildProcess(mockOutputLines) as any)

    const runner = new ClaudeCLIRunner({ claudeBin: 'claude' })
    const result = await runner.run(invocation)

    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 10,
      cacheReadTokens: 5,
      costUsd: 0.001,
      model: 'claude-opus-4-8',
      effort: undefined, // Assuming effort is not part of the output event for now
    })
    expect(result.success).toBe(true)
    expect(result.raw).toBe('Final Answer')
  })

  it('should handle ENOENT error when claude binary is not found', async () => {
    const mockError: NodeJS.ErrnoException = new Error('spawnSync ENOENT')
    mockError.code = 'ENOENT'

    mockSpawn.mockReturnValue(new MockChildProcess([], [], 1, mockError) as any)

    const runner = new ClaudeCLIRunner({ claudeBin: 'non-existent-claude' })

    await expect(runner.run(invocation)).rejects.toThrow(
      expect.objectContaining({
        code: AgentRunnerErrorCode.NETWORK_ERROR,
        message: expect.stringContaining('CLI not found'),
      })
    )
  })

  it('should handle timeout correctly', async () => {
    // Process that never closes — timeout must fire first
    mockSpawn.mockReturnValue(new MockChildProcess([], [], 0, undefined, { hang: true }) as any)

    const runner = new ClaudeCLIRunner({ claudeBin: 'claude', timeoutMs: 50 })

    await expect(runner.run(invocation)).rejects.toThrow(
      expect.objectContaining({
        code: AgentRunnerErrorCode.TIMEOUT,
        message: expect.stringContaining('timed out'),
      })
    )
  })

  it('should pass model and effort from invocation to CLI arguments', async () => {
    const invocationWithOverrides: AgentInvocation = {
      ...invocation,
      model: 'fable',
      effort: 'max',
    }

    mockSpawn.mockReturnValue(new MockChildProcess() as any)

    const runner = new ClaudeCLIRunner({ claudeBin: 'claude' })
    await runner.run(invocationWithOverrides)

    // Verify spawn was called with the correct arguments
    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--model', 'fable', '--effort', 'max']),
      expect.anything()
    )
  })
})
