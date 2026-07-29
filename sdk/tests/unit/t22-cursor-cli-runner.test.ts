import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CursorCLIRunner } from '../../src/agent-runner/cursor-cli/CursorCLIRunner'
import { AgentRunnerErrorCode } from '../../src/agent-runner/AgentRunnerError'
import { defaultProgress } from '../../src/agent-runner/CliRunnerProgress'

vi.mock('../../src/agent-runner/CliRunnerProgress', async () => {
  const actual = await vi.importActual<typeof import('../../src/agent-runner/CliRunnerProgress')>('../../src/agent-runner/CliRunnerProgress')
  return {
    ...actual,
    defaultProgress: vi.fn(),
  }
})

describe('T22 — CursorCLIRunner', () => {
  let runner: CursorCLIRunner

  beforeEach(() => {
    vi.clearAllMocks()
    runner = new CursorCLIRunner({ model: 'cursor-fallback-model' })
  })

  it('TC-CU-CLI-01: builds correct args with all fields provided', () => {
    // Arrange
    const invocation = {
      skill: 'test-skill',
      agent: 'developer-backend',
      mode: 'autonomous' as const,
      payload: {},
      prompt: 'hello world',
      workspacePath: '/my-workspace',
      additionalDirs: ['/extra1', '/extra2'],
    };

    // Act
    const args = (runner as any).buildArgs('hello world', invocation);

    // Assert
    expect(args).toContain('--print')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--stream-partial-output')
    expect(args).toContain('--force')
    expect(args).toContain('--trust')
    expect(args).toContain('--model')
    expect(args).toContain('cursor-fallback-model')
    expect(args).toContain('--workspace')
    expect(args).toContain('/my-workspace')
    expect(args).toContain('/extra1')
    expect(args).toContain('/extra2')
  })

  it('TC-CU-CLI-02: onStdoutLine handles thinking event with subtype delta', () => {
    // Arrange
    const line = JSON.stringify({
      type: 'thinking',
      subtype: 'delta',
      text: 'thinking process info'
    });
    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {} };

    // Act
    (runner as any).onStdoutLine(line, invocation);

    // Assert
    expect(defaultProgress).toHaveBeenCalledWith({
      agent: 'a',
      skill: 's',
      type: 'text',
      text: 'thinking process info',
    })
  })

  it('TC-CU-CLI-03: onStdoutLine handles assistant message with content blocks', () => {
    // Arrange
    const line = JSON.stringify({
      type: 'assistant',
      timestamp_ms: 123456789,
      session_id: 'session-123',
      message: {
        content: [
          { type: 'text', text: 'hello context' },
          { type: 'tool_use', name: 'read_file' }
        ]
      }
    });
    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {} };

    // Act
    (runner as any).onStdoutLine(line, invocation);

    // Assert
    expect(defaultProgress).toHaveBeenCalledWith({
      agent: 'a',
      skill: 's',
      type: 'text',
      text: 'hello context',
    })
    expect(defaultProgress).toHaveBeenCalledWith({
      agent: 'a',
      skill: 's',
      type: 'tool_use',
      toolName: 'read_file',
    })
  })

  it('TC-CU-CLI-04: onStdoutLine ignores irrelevant types', () => {
    // Arrange
    const line1 = JSON.stringify({ type: 'other-type' });
    const line2 = JSON.stringify({ type: 'assistant' }); // missing session_id / timestamp_ms
    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {} };

    // Act
    (runner as any).onStdoutLine(line1, invocation);
    (runner as any).onStdoutLine(line2, invocation);

    // Assert
    expect(defaultProgress).not.toHaveBeenCalled()
  })

  it('TC-CU-CLI-05: parses stdout results correctly', () => {
    // Arrange
    const stdout = [
      JSON.stringify({
        type: 'result',
        subtype: 'done',
        is_error: false,
        result: '{"score": 0.99}',
        total_cost_usd: 0.02,
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          cacheWriteTokens: 200,
          cacheReadTokens: 100
        }
      })
    ].join('\n');
    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {}, model: 'gpt-4' };

    // Act
    const parsed = (runner as any).parseOutput(stdout, 'some stderr', invocation);

    // Assert
    expect(parsed.success).toBe(true)
    expect(parsed.stdout).toBe('{"score": 0.99}')
    expect(parsed.stderr).toBe('some stderr')
    expect(parsed.usage).toEqual({
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 200,
      cacheReadTokens: 100,
      costUsd: 0.02,
      model: 'cursor-fallback-model',
      effort: ''
    })
    expect(parsed.artefacts).toEqual({ score: 0.99 })
  })

  it('TC-CU-CLI-06: parses result event is_error=true correctly', () => {
    // Arrange
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'error',
      is_error: true,
      result: 'an error occurred'
    });
    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {} };

    // Act
    const parsed = (runner as any).parseOutput(stdout, '', invocation);

    // Assert
    expect(parsed.success).toBe(false)
  })

  it('TC-CU-CLI-07: checkParsed returns AgentRunnerError if success is false', () => {
    // Arrange
    const parsed = { success: false, raw: 'failed execution' };
    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {} };

    // Act
    const err = (runner as any).checkParsed(parsed, invocation);

    // Assert
    expect(err).toBeDefined()
    expect(err.code).toBe(AgentRunnerErrorCode.API_ERROR)
  })
})
