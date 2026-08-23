import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { Runner, AgentInvocation } from '../types'
import { AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerFactory } from '../AgentRunnerFactory'

// ─── Hoisted mock ─────────────────────────────────────────────────────────────
const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }))

vi.mock('cross-spawn', () => ({ default: mockSpawn }))

// ─── Import after mock ────────────────────────────────────────────────────────
import { OpenCodeCLIRunner } from '../opencode-cli/OpenCodeCliRunner'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeChild(opts: {
  exitCode?: number
  stdout?: string | string[]
  stderr?: string | string[]
  enoent?: boolean
  hang?: boolean
} = {}) {
  const child = new EventEmitter() as any
  child.pid = 42
  child.kill = vi.fn()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { write: vi.fn(), end: vi.fn() }

  if (opts.hang) {
    return child
  }

  setTimeout(() => {
    if (opts.enoent) {
      const err: NodeJS.ErrnoException = new Error('spawn opencode ENOENT')
      err.code = 'ENOENT'
      child.emit('error', err)
      return
    }

    if (opts.stdout) {
      const chunks = Array.isArray(opts.stdout) ? opts.stdout : [opts.stdout]
      for (const chunk of chunks) {
        child.stdout.emit('data', Buffer.from(chunk))
      }
    }

    if (opts.stderr) {
      const chunks = Array.isArray(opts.stderr) ? opts.stderr : [opts.stderr]
      for (const chunk of chunks) {
        child.stderr.emit('data', Buffer.from(chunk))
      }
    }

    child.emit('close', opts.exitCode ?? 0)
  }, 0)

  return child
}

const baseInvocation: AgentInvocation = {
  skill: 'test-skill',
  agent: 'test-agent',
  mode: 'autonomous',
  payload: { key: 'value' },
  prompt: 'Hello OpenCode',
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('OpenCodeCLIRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Instantiation & Registration', () => {
    it('verifies Runner.OPENCODE_CLI equals "opencode-cli"', () => {
      expect(Runner.OPENCODE_CLI).toBe('opencode-cli')
    })

    it('instantiates OpenCodeCLIRunner successfully with default config', () => {
      const runner = new OpenCodeCLIRunner()
      expect(runner.type).toBe('opencode-cli')
    })

    it('registers in AgentRunnerRegistry under Runner.OPENCODE_CLI', () => {
      expect(AgentRunnerRegistry.has(Runner.OPENCODE_CLI)).toBe(true)
      expect(AgentRunnerRegistry.has('opencode-cli')).toBe(true)
    })

    it('resolves OpenCodeCLIRunner instance from AgentRunnerFactory when type is "opencode-cli"', () => {
      const runner = AgentRunnerFactory.create({ type: 'opencode-cli' })
      expect(runner).toBeInstanceOf(OpenCodeCLIRunner)
    })
  })

  describe('CLI Argument Mapping (buildArgs)', () => {
    it('should build base CLI args ["run"] when minimal invocation is provided', () => {
      const runner = new OpenCodeCLIRunner()
      // @ts-ignore - protected method access
      const args = runner.buildArgs(baseInvocation.prompt!, baseInvocation)
      expect(args).toEqual(['run', '--agent', 'test-agent'])
    })

    it('should build base CLI args ["run"] with no agent if agent not provided', () => {
      const runner = new OpenCodeCLIRunner()
      const inv: AgentInvocation = {
        agent: '',
        mode: 'autonomous',
        prompt: 'test',
      }
      // @ts-ignore - protected method access
      const args = runner.buildArgs(inv.prompt!, inv)
      expect(args).toEqual(['run'])
    })

    it('should append -m or --model when model is provided in invocation', () => {
      const runner = new OpenCodeCLIRunner()
      const inv: AgentInvocation = {
        ...baseInvocation,
        model: 'anthropic/claude-3-7-sonnet',
      }
      // @ts-ignore - protected method access
      const args = runner.buildArgs(inv.prompt!, inv)
      expect(args).toContain('--model')
      expect(args[args.indexOf('--model') + 1]).toBe('anthropic/claude-3-7-sonnet')
    })

    it('should append model from runner constructor config when not in invocation', () => {
      const runner = new OpenCodeCLIRunner({ model: 'openai/gpt-4o' })
      // @ts-ignore - protected method access
      const args = runner.buildArgs(baseInvocation.prompt!, baseInvocation)
      expect(args).toContain('--model')
      expect(args[args.indexOf('--model') + 1]).toBe('openai/gpt-4o')
    })

    it('should append --agent when agent is provided in invocation', () => {
      const runner = new OpenCodeCLIRunner()
      const inv: AgentInvocation = {
        ...baseInvocation,
        agent: 'developer-backend',
      }
      // @ts-ignore - protected method access
      const args = runner.buildArgs(inv.prompt!, inv)
      expect(args).toContain('--agent')
      expect(args[args.indexOf('--agent') + 1]).toBe('developer-backend')
    })

    it('should append --session when invocation contains session.id', () => {
      const runner = new OpenCodeCLIRunner()
      const inv: AgentInvocation = {
        ...baseInvocation,
        session: { id: 'sess-opencode-9876' },
      }
      // @ts-ignore - protected method access
      const args = runner.buildArgs(inv.prompt!, inv)
      expect(args).toContain('--session')
      expect(args[args.indexOf('--session') + 1]).toBe('sess-opencode-9876')
    })

    it('should append --dir when invocation contains workspacePath', () => {
      const runner = new OpenCodeCLIRunner()
      const inv: AgentInvocation = {
        ...baseInvocation,
        workspacePath: '/path/to/project',
      }
      // @ts-ignore - protected method access
      const args = runner.buildArgs(inv.prompt!, inv)
      expect(args).toContain('--dir')
      expect(args[args.indexOf('--dir') + 1]).toBe('/path/to/project')
    })

    it('should append --effort when effort is provided', () => {
      const runner = new OpenCodeCLIRunner()
      const inv: AgentInvocation = {
        ...baseInvocation,
        effort: 'high',
      }
      // @ts-ignore - protected method access
      const args = runner.buildArgs(inv.prompt!, inv)
      expect(args).toContain('--effort')
      expect(args[args.indexOf('--effort') + 1]).toBe('high')
    })

    it('should append --add-dir for each additional directory', () => {
      const runner = new OpenCodeCLIRunner()
      const inv: AgentInvocation = {
        ...baseInvocation,
        additionalDirs: ['/extra/dir1', '/extra/dir2'],
      }
      // @ts-ignore - protected method access
      const args = runner.buildArgs(inv.prompt!, inv)
      expect(args).toContain('--add-dir')
      expect(args).toEqual(expect.arrayContaining(['--add-dir', '/extra/dir1', '--add-dir', '/extra/dir2']))
    })

    it('should write prompt to stdin (writePromptToStdin is true)', () => {
      const runner = new OpenCodeCLIRunner()
      // @ts-ignore - protected getter access
      expect(runner.writePromptToStdin).toBe(true)
    })
  })

  describe('Stream Parsing & Progress Reporting (onStdoutLine)', () => {
    it('should handle text chunk events in onStdoutLine', () => {
      const runner = new OpenCodeCLIRunner()
      const line = JSON.stringify({ type: 'text', text: 'Analyzing code...' })
      // @ts-ignore
      expect(() => runner.onStdoutLine(line, baseInvocation)).not.toThrow()
    })

    it('should handle assistant message events in onStdoutLine', () => {
      const runner = new OpenCodeCLIRunner()
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Processing feature...' },
            { type: 'tool_use', name: 'read_file' },
          ],
        },
      })
      // @ts-ignore
      expect(() => runner.onStdoutLine(line, baseInvocation)).not.toThrow()
    })

    it('should handle item.completed events in onStdoutLine', () => {
      const runner = new OpenCodeCLIRunner()
      const line = JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'Step 1 complete' },
      })
      // @ts-ignore
      expect(() => runner.onStdoutLine(line, baseInvocation)).not.toThrow()
    })

    it('should ignore non-JSON stream lines without throwing', () => {
      const runner = new OpenCodeCLIRunner()
      // @ts-ignore
      expect(() => runner.onStdoutLine('raw log line that is not json', baseInvocation)).not.toThrow()
    })
  })

  describe('Output Extraction (parseOutput)', () => {
    it('should clean ANSI escape sequences and return trimmed raw text in AgentOutput', async () => {
      const ansiOutput = '\u001b[32mExecution successful\u001b[0m\n\u001b[1mResult ready\u001b[0m'
      mockSpawn.mockReturnValue(makeChild({ stdout: ansiOutput }))

      const runner = new OpenCodeCLIRunner()
      const result = await runner.run(baseInvocation)

      expect(result.success).toBe(true)
      expect(result.raw).toBe('Execution successful\nResult ready')
      expect(result.raw).not.toContain('\u001b[32m')
    })

    it('should extract JSON object artefacts from raw response when structured JSON block is present', async () => {
      const output = [
        'Here is the analysis:\n```json',
        JSON.stringify({ status: 'OK', coverage: 95 }, null, 2),
        '```',
      ].join('\n')

      mockSpawn.mockReturnValue(makeChild({ stdout: output }))

      const runner = new OpenCodeCLIRunner()
      const result = await runner.run(baseInvocation)

      expect(result.success).toBe(true)
      expect(result.artefacts).toEqual({ status: 'OK', coverage: 95 })
    })

    it('should extract session ID from JSON stream output', async () => {
      const streamLines = [
        '{"type":"session.started","session_id":"sess-stream-123"}\n',
        '{"type":"result","result":"Task completed successfully"}\n',
      ].join('')

      mockSpawn.mockReturnValue(makeChild({ stdout: streamLines }))

      const runner = new OpenCodeCLIRunner()
      const result = await runner.run(baseInvocation)

      expect(result.success).toBe(true)
      expect(result.session).toEqual({ id: 'sess-stream-123' })
      expect(result.raw).toBe('Task completed successfully')
    })

    it('should preserve invocation.session.id if output has no session id', async () => {
      mockSpawn.mockReturnValue(makeChild({ stdout: 'Done with task' }))

      const runner = new OpenCodeCLIRunner()
      const result = await runner.run({
        ...baseInvocation,
        session: { id: 'sess-existing-456' },
      })

      expect(result.success).toBe(true)
      expect(result.session).toEqual({ id: 'sess-existing-456' })
    })

    it('should extract token usage metrics when present in result stream', async () => {
      const streamLines = [
        '{"type":"result","result":"Done","usage":{"input_tokens":500,"output_tokens":250,"cache_creation_input_tokens":50,"cache_read_input_tokens":100},"total_cost_usd":0.015,"modelUsage":{"anthropic/claude-3-7-sonnet":{"input":500,"output":250}}}\n',
      ].join('')

      mockSpawn.mockReturnValue(makeChild({ stdout: streamLines }))

      const runner = new OpenCodeCLIRunner()
      const result = await runner.run(baseInvocation)

      expect(result.success).toBe(true)
      expect(result.usage).toMatchObject({
        inputTokens: 500,
        outputTokens: 250,
        cacheCreationTokens: 50,
        cacheReadTokens: 100,
        costUsd: 0.015,
        model: 'anthropic/claude-3-7-sonnet',
      })
    })

    it('should extract single JSON output format with structured_output, usage, and conversation_id', async () => {
      const singleJson = JSON.stringify({
        conversation_id: 'conv-opencode-555',
        status: 'SUCCESS',
        response: 'All tests passed',
        structured_output: { passed: 10, failed: 0 },
        usage: {
          input_tokens: 300,
          output_tokens: 120,
          cache_creation_tokens: 20,
          cache_read_tokens: 40,
          cost_usd: 0.005,
        },
      })

      mockSpawn.mockReturnValue(makeChild({ stdout: singleJson }))

      const runner = new OpenCodeCLIRunner()
      const result = await runner.run(baseInvocation)

      expect(result.success).toBe(true)
      expect(result.raw).toBe('All tests passed')
      expect(result.session).toEqual({ id: 'conv-opencode-555' })
      expect(result.artefacts).toEqual({ passed: 10, failed: 0 })
      expect(result.usage).toMatchObject({
        inputTokens: 300,
        outputTokens: 120,
        cacheCreationTokens: 20,
        cacheReadTokens: 40,
        costUsd: 0.005,
      })
    })
  })

  describe('Error Handling & Edge Cases', () => {
    it('should throw AgentRunnerError with NETWORK_ERROR code when opencode binary is not found (ENOENT)', async () => {
      mockSpawn.mockReturnValue(makeChild({ enoent: true }))

      const runner = new OpenCodeCLIRunner()
      await expect(runner.run(baseInvocation)).rejects.toMatchObject({
        code: AgentRunnerErrorCode.NETWORK_ERROR,
        message: expect.stringContaining('opencode CLI not found'),
      })
    })

    it('should throw AgentRunnerError with TIMEOUT code when execution exceeds timeoutMs', async () => {
      mockSpawn.mockReturnValue(makeChild({ hang: true }))

      const runner = new OpenCodeCLIRunner()
      await expect(runner.run({ ...baseInvocation, timeoutMs: 50 })).rejects.toMatchObject({
        code: AgentRunnerErrorCode.TIMEOUT,
        message: expect.stringContaining('opencode runner timed out'),
      })
    })

    it('should throw AgentRunnerError with UNKNOWN_ERROR code when child process exits with non-zero exit code', async () => {
      mockSpawn.mockReturnValue(makeChild({ exitCode: 1, stderr: 'Unknown flag --invalid' }))

      const runner = new OpenCodeCLIRunner()
      await expect(runner.run(baseInvocation)).rejects.toMatchObject({
        code: AgentRunnerErrorCode.UNKNOWN_ERROR,
        message: expect.stringContaining('opencode CLI exited with code 1'),
      })
    })

    it('should throw AgentRunnerError with API_ERROR code when JSON result indicates error', async () => {
      const errorOutput = JSON.stringify({
        status: 'FAILED',
        error: 'Model provider connection refused',
      })

      mockSpawn.mockReturnValue(makeChild({ stdout: errorOutput }))

      const runner = new OpenCodeCLIRunner()
      await expect(runner.run(baseInvocation)).rejects.toMatchObject({
        code: AgentRunnerErrorCode.API_ERROR,
        message: expect.stringContaining('opencode agent returned an error'),
      })
    })

    it('should throw AgentRunnerError with API_ERROR when stream result event has is_error: true', async () => {
      const streamLines = [
        '{"type":"result","is_error":true,"result":"Syntax error in input prompt"}\n',
      ].join('')

      mockSpawn.mockReturnValue(makeChild({ stdout: streamLines }))

      const runner = new OpenCodeCLIRunner()
      await expect(runner.run(baseInvocation)).rejects.toMatchObject({
        code: AgentRunnerErrorCode.API_ERROR,
        message: expect.stringContaining('opencode agent returned an error: Syntax error in input prompt'),
      })
    })
  })

  describe('Full Lifecycle, Session Resumption & Stdin', () => {
    it('should write prompt to child process stdin and close stream', async () => {
      const mockChild = makeChild({ stdout: 'Prompt received' })
      mockSpawn.mockReturnValue(mockChild)

      const runner = new OpenCodeCLIRunner()
      const result = await runner.run(baseInvocation)

      expect(mockChild.stdin.write).toHaveBeenCalledWith('Hello OpenCode', 'utf8')
      expect(mockChild.stdin.end).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.raw).toBe('Prompt received')
    })

    it('should resume existing session when session.id is passed', async () => {
      const mockChild = makeChild({ stdout: 'Session resumed and prompt executed' })
      mockSpawn.mockReturnValue(mockChild)

      const runner = new OpenCodeCLIRunner()
      const result = await runner.run({
        ...baseInvocation,
        session: { id: 'sess-12345' },
      })

      expect(result.success).toBe(true)
      expect(result.session).toEqual({ id: 'sess-12345' })
      // @ts-ignore
      const args = runner.buildArgs(baseInvocation.prompt!, { ...baseInvocation, session: { id: 'sess-12345' } })
      expect(args).toContain('--session')
      expect(args).toContain('sess-12345')
    })
  })
})
