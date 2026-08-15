import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentInvocation } from '../types'
import { AntigravityCLIRunner } from '../antigravity-cli/AntigravityCLIRunner'
import { AgentRunnerErrorCode } from '../AgentRunnerError'
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

describe('AntigravityCLIRunner', () => {
  let invocation: AgentInvocation
  let mockSpawn: ReturnType<typeof vi.mocked<typeof spawn>>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawn = vi.mocked(spawn)

    invocation = {
      prompt: 'Hello Antigravity',
      skill: 'test-skill',
      agent: 'test-agent',
      payload: { key: 'value' },
      mode: 'autonomous',
    }
  })

  it('should enable writePromptToStdin to avoid ENAMETOOLONG on long prompts', () => {
    const runner = new AntigravityCLIRunner()
    // @ts-ignore - protected property access
    expect(runner.writePromptToStdin).toBe(true)
  })

  it('should build correct CLI arguments without -p prompt flag', () => {
    const runner = new AntigravityCLIRunner()
    // @ts-ignore - protected method access
    const args = runner.buildArgs(invocation.prompt, invocation)

    expect(args).toEqual([
      '--output-format', 'json',
      '--print-timeout', '1801000ms',
      '--dangerously-skip-permissions',
      '--agent', 'test-agent',
    ])
    expect(args).not.toContain('-p')
    expect(args).not.toContain('Hello Antigravity')
  })

  it('should correctly parse json output format from agy', async () => {
    const mockJsonOutput = JSON.stringify({
      conversation_id: '123-abc',
      status: 'SUCCESS',
      response: 'Greeting response text',
      duration_seconds: 1.25,
      structured_output: { result: 'ok' },
      usage: {
        input_tokens: 1500,
        output_tokens: 200,
        cache_read_tokens: 500,
        total_tokens: 2200,
      },
    })

    const mockProcess = new MockChildProcess([mockJsonOutput]) as any
    mockSpawn.mockReturnValue(mockProcess)

    const runner = new AntigravityCLIRunner()
    const result = await runner.run(invocation)

    expect(mockProcess.stdin.write).toHaveBeenCalledWith('Hello Antigravity', 'utf8')
    expect(mockProcess.stdin.end).toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.raw).toBe('Greeting response text')
    expect(result.usage).toMatchObject({
      inputTokens: 1500,
      outputTokens: 200,
      cacheReadTokens: 500,
    })
    expect(result.artefacts).toEqual({ result: 'ok' })
  })

  it('should handle JSON error status response from agy', async () => {
    const mockJsonOutput = JSON.stringify({
      conversation_id: '123-abc',
      status: 'FAILED',
      response: 'Error occurred during execution',
    })

    mockSpawn.mockReturnValue(new MockChildProcess([mockJsonOutput]) as any)

    const runner = new AntigravityCLIRunner()

    await expect(runner.run(invocation)).rejects.toThrow(
      expect.objectContaining({
        code: AgentRunnerErrorCode.API_ERROR,
        message: expect.stringContaining('Error occurred during execution'),
      })
    )
  })

  it('should fallback to plain text if agy stdout is not JSON', async () => {
    const plainText = 'Plain text response from agy'

    mockSpawn.mockReturnValue(new MockChildProcess([plainText]) as any)

    const runner = new AntigravityCLIRunner()
    const result = await runner.run(invocation)

    expect(result.success).toBe(true)
    expect(result.raw).toBe('Plain text response from agy')
  })
})
