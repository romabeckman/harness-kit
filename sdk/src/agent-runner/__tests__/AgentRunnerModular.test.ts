import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerFactory } from '../AgentRunnerFactory'
import { AntigravityCLIRunner } from '../antigravity-cli/AntigravityCLIRunner'
import type { IAgentRunner } from '../IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../types'
import spawn from 'cross-spawn'

vi.mock('cross-spawn', () => {
  return {
    default: vi.fn(),
  }
})

describe('AgentRunnerModular', () => {
  beforeEach(() => {
    AgentRunnerRegistry.clear()
    vi.restoreAllMocks()
  })

  it('TS01 — Dynamic Runner Registration & Instantiation (Happy Path)', () => {
    class MockRunner implements IAgentRunner {
      async run(invocation: AgentInvocation): Promise<AgentOutput> {
        return {
          success: true,
          stdout: 'Mock run done',
          stderr: '',
          raw: 'Mock run done',
        }
      }
    }

    AgentRunnerRegistry.register({
      type: 'mock-runner',
      constructor: MockRunner,
    })

    expect(AgentRunnerRegistry.has('mock-runner')).toBe(true)

    const runner = AgentRunnerFactory.create({ type: 'mock-runner' })
    expect(runner).toBeInstanceOf(MockRunner)
  })

  it('TS02 — Custom Configuration Validation', () => {
    class SecureRunner implements IAgentRunner {
      async run(invocation: AgentInvocation): Promise<AgentOutput> {
        return { success: true, stdout: '', stderr: '', raw: '' }
      }
    }

    const validate = (config: any) => {
      if (!config.apiKey) {
        throw new Error('API key is required')
      }
    }

    AgentRunnerRegistry.register({
      type: 'secure-runner',
      constructor: SecureRunner,
      validateConfig: validate,
    })

    expect(() => AgentRunnerFactory.create({ type: 'secure-runner' })).toThrow('API key is required')
  })

  it('TS03 — Duplicate Registration Safety', () => {
    class SomeRunner implements IAgentRunner {
      async run(): Promise<AgentOutput> {
        return { success: true, stdout: '', stderr: '', raw: '' }
      }
    }
    class AnotherRunner implements IAgentRunner {
      async run(): Promise<AgentOutput> {
        return { success: true, stdout: '', stderr: '', raw: '' }
      }
    }

    AgentRunnerRegistry.register({
      type: 'custom-runner',
      constructor: SomeRunner,
    })

    expect(() => {
      AgentRunnerRegistry.register({
        type: 'custom-runner',
        constructor: AnotherRunner,
      })
    }).toThrow()
  })

  it('TS04 — Unregistered Runner Resolution Failure', () => {
    expect(() => {
      AgentRunnerFactory.create({ type: 'invalid-runner' })
    }).toThrow('Runner type "invalid-runner" not registered.')
  })

  it('TS05 — Execution AbortSignal Propagation', async () => {
    const mockChild: any = {
      pid: 1234,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { write: vi.fn(), end: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    }
    vi.mocked(spawn).mockReturnValue(mockChild)

    const runner = new AntigravityCLIRunner()
    const controller = new AbortController()

    const promise = runner.run(
      {
        skill: 'test',
        agent: 'test-agent',
        mode: 'autonomous',
        payload: {},
        prompt: 'test prompt',
      },
      { signal: controller.signal }
    )

    controller.abort()

    await expect(promise).rejects.toThrow(/aborted|canceled/i)
  })

  it('TS06 — Standardized Usage Extraction', () => {
    const output: AgentOutput = {
      success: true,
      stdout: 'Done',
      stderr: '',
      raw: 'Done',
      usage: {
        inputTokens: 150,
        outputTokens: 300,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0.005,
      },
    }

    expect(output.usage?.inputTokens).toBe(150)
    expect(output.usage?.outputTokens).toBe(300)
  })
})
