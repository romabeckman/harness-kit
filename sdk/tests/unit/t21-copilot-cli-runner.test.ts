import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CopilotCLIRunner } from '../../src/agent-runner/copilot-cli/CopilotCLIRunner'
import { AgentRunnerErrorCode } from '../../src/agent-runner/AgentRunnerError'
import { defaultProgress } from '../../src/agent-runner/CliRunnerProgress'

vi.mock('../../src/agent-runner/CliRunnerProgress', async () => {
  const actual = await vi.importActual<typeof import('../../src/agent-runner/CliRunnerProgress')>('../../src/agent-runner/CliRunnerProgress')
  return {
    ...actual,
    defaultProgress: vi.fn(),
  }
})

describe('T21 — CopilotCLIRunner', () => {
  let runner: CopilotCLIRunner

  beforeEach(() => {
    vi.clearAllMocks()
    runner = new CopilotCLIRunner({ model: 'fallback-model' })
  })

  it('TC-CO-01: builds correct args with all fields provided', () => {
    // Arrange
    const invocation = {
      skill: 'test-skill',
      agent: 'developer-backend',
      mode: 'autonomous' as const,
      payload: {},
      prompt: 'hello world',
      effort: 'high',
      additionalDirs: ['/dir1', '/dir2'],
    };

    // Act
    // Accessing protected method buildArgs via helper or as any
    const args = (runner as any).buildArgs('hello world', invocation)

    // Assert
    expect(args).toContain('--allow-all')
    expect(args).toContain('--autopilot')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
    expect(args).toContain('--model')
    expect(args).toContain('fallback-model')
    expect(args).toContain('--reasoning-effort')
    expect(args).toContain('high')
    expect(args).toContain('--agent')
    expect(args).toContain('developer-backend')
    expect(args).toContain('--add-dir')
    expect(args).toContain('/dir1')
    expect(args).toContain('/dir2')
    expect(args).toContain('--prompt')
    expect(args).toContain('hello world')
  })

  it('TC-CO-02: builds correct args without optional fields', () => {
    // Arrange
    const minimalRunner = new CopilotCLIRunner()
    const invocation = {
      skill: 'test-skill',
      mode: 'autonomous' as const,
      payload: {},
    };

    // Act
    const args = (minimalRunner as any).buildArgs('my prompt', invocation)

    // Assert
    expect(args).toContain('--allow-all')
    expect(args).not.toContain('--model')
    expect(args).not.toContain('--reasoning-effort')
    expect(args).not.toContain('--agent')
    expect(args).not.toContain('--add-dir')
    expect(args).toContain('my prompt')
  })

  it('TC-CO-03: parses stdout events correctly', () => {
    // Arrange
    const stdout = [
      JSON.stringify({ type: 'assistant.message', data: { content: 'hello from assistant', outputTokens: 42 } }),
      JSON.stringify({ type: 'result', exitCode: 0 })
    ].join('\n');

    const invocation = {
      skill: 's',
      agent: 'a',
      mode: 'autonomous' as const,
      payload: {},
    };

    // Act
    const parsed = (runner as any).parseOutput(stdout, 'some stderr', invocation)

    // Assert
    expect(parsed.success).toBe(true)
    expect(parsed.stdout).toBe('hello from assistant')
    expect(parsed.raw).toBe('hello from assistant')
    expect(parsed.stderr).toBe('some stderr')
    expect(parsed.usage).toEqual({
      inputTokens: 0,
      outputTokens: 42,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
      model: 'fallback-model',
      effort: undefined,
    })
  })

  it('TC-CO-04: parses exitCode non-zero as success false', () => {
    // Arrange
    const stdout = [
      JSON.stringify({ type: 'result', exitCode: 1 })
    ].join('\n');

    const invocation = {
      skill: 's',
      agent: 'a',
      mode: 'autonomous' as const,
      payload: {},
    };

    // Act
    const parsed = (runner as any).parseOutput(stdout, '', invocation)

    // Assert
    expect(parsed.success).toBe(false)
  })

  it('TC-CO-05: ignores invalid JSON lines when parsing', () => {
    // Arrange
    const stdout = [
      'non-json line',
      JSON.stringify({ type: 'assistant.message', data: { content: 'hello' } })
    ].join('\n');

    const invocation = {
      skill: 's',
      agent: 'a',
      mode: 'autonomous' as const,
      payload: {},
    };

    // Act
    const parsed = (runner as any).parseOutput(stdout, '', invocation)

    // Assert
    expect(parsed.stdout).toBe('hello')
  })

  it('TC-CO-06: triggers defaultProgress on assistant.message', () => {
    // Arrange
    const line = JSON.stringify({ type: 'assistant.message', data: { content: 'progress update' } })
    const invocation = {
      skill: 's',
      agent: 'a',
      mode: 'autonomous' as const,
      payload: {},
    };

    // Act
    (runner as any).onStdoutLine(line, invocation)

    // Assert
    expect(defaultProgress).toHaveBeenCalledWith({
      agent: 'a',
      skill: 's',
      type: 'text',
      text: 'progress update',
    })
  })

  it('TC-CO-07: ignores non assistant.message events in onStdoutLine', () => {
    // Arrange
    const line = JSON.stringify({ type: 'other.event', data: {} })
    const invocation = {
      skill: 's',
      agent: 'a',
      mode: 'autonomous' as const,
      payload: {},
    };

    // Act
    (runner as any).onStdoutLine(line, invocation)

    // Assert
    expect(defaultProgress).not.toHaveBeenCalled()
  })

  it('TC-CO-08: checkParsed returns error when success is false', () => {
    // Arrange
    const parsed = { success: false, raw: 'raw error msg' };
    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {} };

    // Act
    const err = (runner as any).checkParsed(parsed, invocation)

    // Assert
    expect(err).toBeDefined()
    expect(err.code).toBe(AgentRunnerErrorCode.API_ERROR)
    expect(err.message).toContain('copilot agent returned an error: raw error msg')
  })

  it('TC-CO-09: checkParsed returns null when success is true', () => {
    // Arrange
    const parsed = { success: true };
    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {} };

    // Act
    const err = (runner as any).checkParsed(parsed, invocation)

    // Assert
    expect(err).toBeNull()
  })
})
