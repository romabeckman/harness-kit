import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable, Writable } from 'node:stream'
import { NullAgentRunner } from '../../src/agent-runner/NullAgentRunner'
import type { IAgentRunner } from '../../src/agent-runner/IAgentRunner'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChild(lines: string[], exitCode = 0) {
  const stdout = new Readable({ read() { } })
  const stdin = new Writable({ write(_, __, cb) { cb() } })
  const child = new EventEmitter() as any
  child.stdout = stdout
  child.stderr = new Readable({ read() { } })
  child.stdin = stdin
  child.kill = vi.fn()
  setTimeout(() => {
    for (const line of lines) stdout.push(line + '\n')
    stdout.push(null)
    child.emit('close', exitCode)
  }, 10)
  return child
}

// ─── NullAgentRunner ─────────────────────────────────────────────────────────

describe('T03 — IAgentRunner interface + NullAgentRunner', () => {
  it('NullAgentRunner implements IAgentRunner', () => {
    const runner: IAgentRunner = new NullAgentRunner()
    expect(runner).toBeDefined()
  })

  it('NullAgentRunner.run() throws NotImplementedError', async () => {
    const runner = new NullAgentRunner()
    await expect(
      runner.run({ skill: 'test', agent: 'test-agent', mode: 'autonomous', payload: {} })
    ).rejects.toThrow('NotImplementedError')
  })

  it('NullAgentRunner.run() throws with descriptive message', async () => {
    const runner = new NullAgentRunner()
    await expect(
      runner.run({ skill: 'tdd-orchestrator', agent: 'developer-backend', mode: 'autonomous', payload: {} })
    ).rejects.toThrow('tdd-orchestrator')
  })
})

// ─── ClaudeCLIRunner ────────────────────────────────────────────────────────

describe('T03 — ClaudeCLIRunner', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('spawns with required args', async () => {
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChild([], 0)),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const { default: spawn } = await import('cross-spawn')
    const runner = new ClaudeCLIRunner()
    await runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} })
    const args: string[] = (spawn as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(args).toContain('--print')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--verbose')
    expect(args).toContain('--input-format')
    expect(args).toContain('text')
    expect(args).toContain('--dangerously-skip-permissions')
  })

  it('adds --agent <agent> arg when invocation.agent is set', async () => {
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChild([], 0)),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const { default: spawn } = await import('cross-spawn')
    const runner = new ClaudeCLIRunner()
    await runner.run({ skill: 's', agent: 'developer-backend', mode: 'autonomous', payload: {} })
    const args: string[] = (spawn as ReturnType<typeof vi.fn>).mock.calls[0][1]
    const agentIdx = args.indexOf('--agent')
    expect(agentIdx).toBeGreaterThan(-1)
    expect(args[agentIdx + 1]).toBe('developer-backend')
  })

  it('writes text progress to stderr for assistant text blocks', async () => {
    const event = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hello world' }] },
    })
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChild([event], 0)),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const runner = new ClaudeCLIRunner()
    await runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} })
    const output = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(output).toContain('hello world')
    stderrSpy.mockRestore()
  })

  it('writes tool_use progress to stderr for tool_use blocks', async () => {
    const event = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash' }] },
    })
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChild([event], 0)),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const runner = new ClaudeCLIRunner()
    await runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} })
    const output = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(output).toContain('→ Bash')
    stderrSpy.mockRestore()
  })

  it('resolves with { raw, usage } when result event is_error=false', async () => {
    const event = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'final output',
      total_cost_usd: 0.005,
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 10 },
    })
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChild([event], 0)),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const runner = new ClaudeCLIRunner()
    const out = await runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} })
    expect(out.raw).toBe('final output')
    expect(out.usage).toBeDefined()
  })

  it('usage populated from total_cost_usd + usage fields', async () => {
    const event = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'ok',
      total_cost_usd: 0.0123,
      usage: { input_tokens: 200, output_tokens: 80, cache_creation_input_tokens: 5, cache_read_input_tokens: 15 },
    })
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChild([event], 0)),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const runner = new ClaudeCLIRunner()
    const out = await runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} })
    expect(out.usage).toMatchObject({
      inputTokens: 200,
      outputTokens: 80,
      cacheCreationTokens: 5,
      cacheReadTokens: 15,
      costUsd: 0.0123,
    })
  })

  it('rejects with AgentRunnerError code API_ERROR when result is_error=true', async () => {
    const event = JSON.stringify({
      type: 'result',
      is_error: true,
      result: 'something went wrong',
    })
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChild([event], 0)),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const { AgentRunnerErrorCode } = await import('../../src/agent-runner/AgentRunnerError')
    const runner = new ClaudeCLIRunner()
    await expect(
      runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} })
    ).rejects.toMatchObject({ code: AgentRunnerErrorCode.API_ERROR })
  })

  it('rejects with AgentRunnerError code NETWORK_ERROR on ENOENT spawn error', async () => {
    const enoentErr = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => {
        const child = new EventEmitter() as any
        child.stdout = new Readable({ read() { } })
        child.stderr = new Readable({ read() { } })
        child.stdin = new Writable({ write(_, __, cb) { cb() } })
        child.kill = vi.fn()
        setTimeout(() => child.emit('error', enoentErr), 10)
        return child
      }),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const { AgentRunnerErrorCode } = await import('../../src/agent-runner/AgentRunnerError')
    const runner = new ClaudeCLIRunner()
    await expect(
      runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} })
    ).rejects.toMatchObject({ code: AgentRunnerErrorCode.NETWORK_ERROR })
  })

  it('uses invocation.prompt as stdin when provided', async () => {
    const stdinChunks: string[] = []
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => {
        const child = new EventEmitter() as any
        child.stdout = new Readable({ read() { } })
        child.stderr = new Readable({ read() { } })
        child.stdin = new Writable({
          write(chunk, _, cb) {
            stdinChunks.push(chunk.toString())
            cb()
          },
        })
        child.kill = vi.fn()
        setTimeout(() => {
          child.stdout.push(null)
          child.emit('close', 0)
        }, 10)
        return child
      }),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const runner = new ClaudeCLIRunner()
    await runner.run({
      skill: 's',
      agent: 'a',
      mode: 'autonomous',
      payload: {},
      prompt: 'explicit prompt override',
    })
    expect(stdinChunks.join('')).toContain('explicit prompt override')
  })

  it('progress written to stderr includes skill tag', async () => {
    const event = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'progress line' }] },
    })
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChild([event], 0)),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const runner = new ClaudeCLIRunner()
    await runner.run({ skill: 'my-skill', agent: 'my-agent', mode: 'autonomous', payload: {} })
    const output = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(output).toContain('[my-skill]')
    expect(output).toContain('progress line')
    stderrSpy.mockRestore()
  })

  it('prints debug info to stderr when DebugContext is enabled', async () => {
    const { DebugContext } = await import('../../src/cli/DebugContext')
    DebugContext.enable()

    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChild([], 0)),
    }))
    const { ClaudeCLIRunner } = await import('../../src/agent-runner/claude-cli/ClaudeCLIRunner')
    const { default: spawn } = await import('cross-spawn')

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const runner = new ClaudeCLIRunner()
    await runner.run({ skill: 'my-skill', agent: 'my-agent', mode: 'autonomous', payload: {} })

    const output = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(output).toContain('[DEBUG] spawn:')
    expect(output).toContain('claude')

    stderrSpy.mockRestore()
    DebugContext.reset()
  })
})

