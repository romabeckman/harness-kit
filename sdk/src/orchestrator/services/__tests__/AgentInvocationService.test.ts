import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentInvocationService } from '../AgentInvocationService'
import { Complexity, Phase } from '../../types'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../../settings/DefaultSettings'
import type { IAgentRunner } from '../../../agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput, TokenUsage } from '../../../agent-runner/types'
import type { OrchestratorConfig } from '../../types'
import type { HarnessSettings } from '../../../settings/HarnessSettings'
import type { TokenLedger } from '../../../telemetry/TokenLedger'
import type { ISessionLedger } from '../../../diagnose/types'

vi.mock('../../../ui/TerminalProgress', () => ({
  TerminalProgress: {
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
  },
}))

vi.mock('../../../ui/AnsiHelpers', () => ({
  AnsiHelpers: {
    yellow: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
  },
}))

vi.mock('../../../orchestrator/utils/OrchestratorFormatter', () => ({
  OrchestratorFormatter: {
    getPhaseDescription: vi.fn().mockReturnValue('phase description'),
    formatDuration: vi.fn().mockReturnValue('1s'),
  },
}))

function makeRunner(output: Partial<AgentOutput> = {}): IAgentRunner {
  return {
    type: 'claude',
    run: vi.fn().mockResolvedValue({
      success: true,
      stdout: '',
      stderr: '',
      raw: '',
      ...output,
    }),
  } as unknown as IAgentRunner
}

function makeLedger(): TokenLedger {
  return { record: vi.fn() } as unknown as TokenLedger
}

function makeSettings(overrides: Record<string, any> = {}): HarnessSettings {
  return {
    resolve: vi.fn().mockReturnValue(overrides),
    getTimeoutMs: vi.fn().mockReturnValue(undefined),
    hasSettings: vi.fn().mockReturnValue(true),
  } as unknown as HarnessSettings
}

function makeConfig(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    scope: 'test',
    score: 0.85,
    reworks: 3,
    projectPaths: [],
    complexity: Complexity.AUTO,
    ...overrides,
  }
}

function makeInvocation(overrides: Partial<AgentInvocation> = {}): AgentInvocation {
  return {
    skill: 'tdd-orchestrator',
    agent: 'developer-backend',
    mode: 'autonomous',
    payload: {},
    ...overrides,
  }
}

describe('AgentInvocationService', () => {
  describe('phaseKey resolution', () => {
    it('uses invocation.phaseKey when explicitly set', async () => {
      const runner = makeRunner()
      const settings = makeSettings()
      const service = new AgentInvocationService(runner, makeLedger())

      await service.invokeAgent(
        makeInvocation({ phaseKey: 'review_adv' }),
        Phase.REVIEW,
        makeConfig(),
        settings
      )

      expect(settings.resolve).toHaveBeenCalledWith('claude', 'review_adv')
    })
  })

  describe('model/effort override from settings', () => {
    it('overrides model when settings.resolve returns a model', async () => {
      const runner = makeRunner()
      const settings = makeSettings({ model: 'claude-opus-4-8' })
      const service = new AgentInvocationService(runner, makeLedger())

      await service.invokeAgent(
        makeInvocation({ model: 'claude-haiku-4-5', phaseKey: 'PLANNING' }),
        Phase.PLANNING,
        makeConfig(),
        settings
      )

      const call = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0][0] as AgentInvocation
      expect(call.model).toBe('claude-opus-4-8')
    })

    it('overrides effort when settings.resolve returns an effort', async () => {
      const runner = makeRunner()
      const settings = makeSettings({ effort: 'max' })
      const service = new AgentInvocationService(runner, makeLedger())

      await service.invokeAgent(
        makeInvocation({ effort: 'low', phaseKey: 'implementation' }),
        Phase.DEVELOPMENT,
        makeConfig(),
        settings
      )

      const call = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0][0] as AgentInvocation
      expect(call.effort).toBe('max')
    })

    it('does NOT override model/effort when settings returns empty object', async () => {
      const runner = makeRunner()
      const settings = makeSettings({})
      const service = new AgentInvocationService(runner, makeLedger())

      await service.invokeAgent(
        makeInvocation({ model: 'original-model', effort: 'high', phaseKey: 'PLANNING' }),
        Phase.PLANNING,
        makeConfig(),
        settings
      )

      const call = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0][0] as AgentInvocation
      expect(call.model).toBe('original-model')
      expect(call.effort).toBe('high')
    })
  })

  describe('projectPaths injection', () => {
    it('appends config.projectPaths to finalInvocation.additionalDirs', async () => {
      const runner = makeRunner()
      const service = new AgentInvocationService(runner, makeLedger())

      await service.invokeAgent(
        makeInvocation({ additionalDirs: ['/existing/dir'] }),
        Phase.DEVELOPMENT,
        makeConfig({ projectPaths: ['/proj/one', '/proj/two'] }),
        makeSettings()
      )

      const call = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0][0] as AgentInvocation
      expect(call.additionalDirs).toEqual(['/existing/dir', '/proj/one', '/proj/two'])
    })

    it('does not modify additionalDirs when projectPaths is empty', async () => {
      const runner = makeRunner()
      const service = new AgentInvocationService(runner, makeLedger())

      await service.invokeAgent(
        makeInvocation({ additionalDirs: ['/dir'] }),
        Phase.DEVELOPMENT,
        makeConfig({ projectPaths: [] }),
        makeSettings()
      )

      const call = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0][0] as AgentInvocation
      expect(call.additionalDirs).toEqual(['/dir'])
    })
  })

  describe('timeout resolution precedence', () => {
    it('uses config.timeoutMs when explicitly set (highest priority)', async () => {
      const runner = makeRunner()
      const settings = {
        resolve: vi.fn().mockReturnValue({}),
        getTimeoutMs: vi.fn().mockReturnValue(99999),
        hasSettings: vi.fn().mockReturnValue(true),
      } as unknown as HarnessSettings
      const service = new AgentInvocationService(runner, makeLedger())

      await service.invokeAgent(
        makeInvocation(),
        Phase.PLANNING,
        makeConfig({ timeoutMs: 12345 }),
        settings
      )

      // settings.getTimeoutMs should NOT be called when config.timeoutMs is defined
      expect(settings.getTimeoutMs).not.toHaveBeenCalled()
    })

    it('uses settings.getTimeoutMs when config.timeoutMs is undefined', async () => {
      const runner = makeRunner()
      const settings = {
        resolve: vi.fn().mockReturnValue({}),
        getTimeoutMs: vi.fn().mockReturnValue(60000),
        hasSettings: vi.fn().mockReturnValue(true),
      } as unknown as HarnessSettings
      const service = new AgentInvocationService(runner, makeLedger())

      await service.invokeAgent(
        makeInvocation({ phaseKey: 'PLANNING' }),
        Phase.PLANNING,
        makeConfig({ timeoutMs: undefined }),
        settings
      )

      expect(settings.getTimeoutMs).toHaveBeenCalledWith('claude', 'planning')
    })

    it('falls back to DEFAULT_PHASE_TIMEOUT_MS when both config and settings return undefined', async () => {
      // Verifying the default is applied: runner.run should be called (not rejected)
      // because timeoutMs defaults to DEFAULT_PHASE_TIMEOUT_MS (30min), not 0.
      const runner = makeRunner()
      const settings = {
        resolve: vi.fn().mockReturnValue({}),
        getTimeoutMs: vi.fn().mockReturnValue(undefined),
        hasSettings: vi.fn().mockReturnValue(true),
      } as unknown as HarnessSettings
      const service = new AgentInvocationService(runner, makeLedger())

      await service.invokeAgent(
        makeInvocation(),
        Phase.DEVELOPMENT,
        makeConfig({ timeoutMs: undefined }),
        settings
      )

      expect(runner.run).toHaveBeenCalledTimes(1)
      expect(DEFAULT_PHASE_TIMEOUT_MS).toBe(1_800_000)
    })
  })

  describe('token ledger recording', () => {
    it('records usage when output contains usage data', async () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 10,
        costUsd: 0.001,
        model: 'claude-sonnet',
      }
      const runner = makeRunner({ usage })
      const ledger = makeLedger()
      const service = new AgentInvocationService(runner, ledger)

      await service.invokeAgent(
        makeInvocation({ skill: 'tdd-orchestrator', agent: 'developer-backend' }),
        Phase.DEVELOPMENT,
        makeConfig(),
        makeSettings()
      )

      expect(ledger.record).toHaveBeenCalledWith('tdd-orchestrator', 'developer-backend', usage)
    })

    it('does NOT record when output has no usage', async () => {
      const runner = makeRunner({ usage: undefined })
      const ledger = makeLedger()
      const service = new AgentInvocationService(runner, ledger)

      await service.invokeAgent(makeInvocation(), Phase.DEVELOPMENT, makeConfig(), makeSettings())

      expect(ledger.record).not.toHaveBeenCalled()
    })
  })

  describe('diagnose ledger recording', () => {
    it('records session with phase and domain when currentPhase is Phase.DEVELOPMENT without tokenUsage', async () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0.001,
      }
      const runner = makeRunner({ usage })
      const diagnoseLedger = { append: vi.fn() } as unknown as ISessionLedger
      const service = new AgentInvocationService(runner, makeLedger(), diagnoseLedger)

      await service.invokeAgent(
        makeInvocation({ domain: 'auth-service', skill: 'tdd-orchestrator', agent: 'developer-backend' }),
        Phase.DEVELOPMENT,
        makeConfig(),
        makeSettings()
      )

      expect(diagnoseLedger.append).toHaveBeenCalledTimes(1)
      const appended = (diagnoseLedger.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(appended.phase).toBe(Phase.DEVELOPMENT)
      expect(appended.domain).toBe('auth-service')
      expect(appended.tokenUsage).toBeUndefined()
    })

    it('records session with phase and domain from payload when currentPhase is Phase.REVIEW without tokenUsage', async () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0.001,
      }
      const runner = makeRunner({ usage })
      const diagnoseLedger = { append: vi.fn() } as unknown as ISessionLedger
      const service = new AgentInvocationService(runner, makeLedger(), diagnoseLedger)

      await service.invokeAgent(
        makeInvocation({ payload: { domain: 'billing' }, skill: 'the-grumpy-tech-lead', agent: 'harness-tech-lead' }),
        Phase.REVIEW,
        makeConfig(),
        makeSettings()
      )

      expect(diagnoseLedger.append).toHaveBeenCalledTimes(1)
      const appended = (diagnoseLedger.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(appended.phase).toBe(Phase.REVIEW)
      expect(appended.domain).toBe('billing')
      expect(appended.tokenUsage).toBeUndefined()
    })

    it('does NOT include domain when currentPhase is not development or review (e.g. PLANNING) but still includes phase', async () => {
      const runner = makeRunner()
      const diagnoseLedger = { append: vi.fn() } as unknown as ISessionLedger
      const service = new AgentInvocationService(runner, makeLedger(), diagnoseLedger)

      await service.invokeAgent(
        makeInvocation({ domain: 'auth-service', payload: { domain: 'auth-service' } }),
        Phase.PLANNING,
        makeConfig(),
        makeSettings()
      )

      expect(diagnoseLedger.append).toHaveBeenCalledTimes(1)
      const appended = (diagnoseLedger.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(appended.phase).toBe(Phase.PLANNING)
      expect(appended.domain).toBeUndefined()
      expect(appended.tokenUsage).toBeUndefined()
    })

    it('does NOT include domain when currentPhase is BOOTSTRAP but still includes phase', async () => {
      const runner = makeRunner()
      const diagnoseLedger = { append: vi.fn() } as unknown as ISessionLedger
      const service = new AgentInvocationService(runner, makeLedger(), diagnoseLedger)

      await service.invokeAgent(
        makeInvocation({ domain: 'auth-service' }),
        Phase.BOOTSTRAP,
        makeConfig(),
        makeSettings()
      )

      expect(diagnoseLedger.append).toHaveBeenCalledTimes(1)
      const appended = (diagnoseLedger.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(appended.phase).toBe(Phase.BOOTSTRAP)
      expect(appended.domain).toBeUndefined()
      expect(appended.tokenUsage).toBeUndefined()
    })
  })

  describe('domain logging', () => {
    it('logs domain on a single line when domain is specified in invocation', async () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0.001,
      }
      const runner = makeRunner({ usage })
      const service = new AgentInvocationService(runner, makeLedger())
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.invokeAgent(
        makeInvocation({ domain: 'auth-service' }),
        Phase.DEVELOPMENT,
        makeConfig(),
        makeSettings()
      )

      const domainLogCall = logSpy.mock.calls.find(call => call[0].includes('Domain: auth-service'))
      expect(domainLogCall).toBeDefined()
      logSpy.mockRestore()
    })

    it('logs domain on a single line when domain is specified in invocation.payload', async () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0.001,
      }
      const runner = makeRunner({ usage })
      const service = new AgentInvocationService(runner, makeLedger())
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.invokeAgent(
        makeInvocation({ payload: { domain: 'payment-gateway' } }),
        Phase.DEVELOPMENT,
        makeConfig(),
        makeSettings()
      )

      const domainLogCall = logSpy.mock.calls.find(call => call[0].includes('Domain: payment-gateway'))
      expect(domainLogCall).toBeDefined()
      logSpy.mockRestore()
    })

    it('does not log domain line when domain is not present', async () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0.001,
      }
      const runner = makeRunner({ usage })
      const service = new AgentInvocationService(runner, makeLedger())
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.invokeAgent(
        makeInvocation({ domain: undefined, payload: {} }),
        Phase.DEVELOPMENT,
        makeConfig(),
        makeSettings()
      )

      const domainLogCall = logSpy.mock.calls.find(call => call[0].includes('Domain:'))
      expect(domainLogCall).toBeUndefined()
      logSpy.mockRestore()
    })
  })

  describe('error propagation', () => {
    it('re-throws errors from runner.run after cleaning up the spinner', async () => {
      const runner: IAgentRunner = {
        type: 'claude',
        run: vi.fn().mockRejectedValue(new Error('runner crashed')),
      } as unknown as IAgentRunner

      const service = new AgentInvocationService(runner, makeLedger())

      await expect(
        service.invokeAgent(makeInvocation(), Phase.DEVELOPMENT, makeConfig({ timeoutMs: 0 }), makeSettings())
      ).rejects.toThrow('runner crashed')
    })
  })

  describe('timeout guard timer', () => {
    it('aborts automatically in non-interactive mode when timeout expires', async () => {
      const runner: IAgentRunner = {
        type: 'claude',
        run: vi.fn().mockImplementation((inv, controller) => {
          return new Promise((resolve, reject) => {
            if (controller?.signal) {
              controller.signal.onabort = () => reject(new Error('Aborted'))
            } else {
              setTimeout(() => reject(new Error('Aborted')), 20)
            }
          })
        }),
      } as unknown as IAgentRunner

      const service = new AgentInvocationService(runner, makeLedger())

      await expect(
        service.invokeAgent(makeInvocation(), Phase.DEVELOPMENT, makeConfig({ timeoutMs: 10 }), makeSettings())
      ).rejects.toThrow('Agent aborted by user after timeout')
    })
  })
})
