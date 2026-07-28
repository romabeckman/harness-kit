import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentInvocationService } from '../../src/orchestrator/services/AgentInvocationService'
import { FakeAgentRunner } from '../helpers/FakeAgentRunner'
import { TokenLedger } from '../../src/telemetry/TokenLedger'
import { HarnessSettings } from '../../src/settings/HarnessSettings'
import { Complexity, Phase } from '../../src/orchestrator/types'
import { DebugContext } from '../../src/cli/DebugContext'

vi.mock('../../src/telemetry/TokenLedger', () => {
  return {
    TokenLedger: class {
      record = vi.fn()
      printReport = vi.fn()
    }
  }
})

describe('T24 — AgentInvocationService', () => {
  let fakeRunner: FakeAgentRunner
  let mockLedger: TokenLedger
  let service: AgentInvocationService

  beforeEach(() => {
    vi.clearAllMocks()
    fakeRunner = new FakeAgentRunner()
    mockLedger = new TokenLedger('mock-tokens.jsonl')
    service = new AgentInvocationService(fakeRunner, mockLedger)
    DebugContext.reset()
  })

  it('TC-AIS-01: uses timeoutMs from config if defined', async () => {
    // Arrange
    const config = { scope: 'test', timeoutMs: 12345, projectPaths: [], complexity: Complexity.AUTO }
    const settings = HarnessSettings.load()
    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {} }

    // Act
    const runSpy = vi.spyOn(fakeRunner, 'run')
    await service.invokeAgent(invocation, Phase.PLANNING, config, settings)

    // Assert
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 12345 }),
      expect.any(Object)
    )
  })

  it('TC-AIS-02: falls back to settings timeout if config timeout is undefined', async () => {
    // Arrange
    fakeRunner = new FakeAgentRunner()
    Object.defineProperty(fakeRunner, 'type', { value: 'claude-cli' })
    service = new AgentInvocationService(fakeRunner, mockLedger)
    const config = { scope: 'test', projectPaths: [], complexity: Complexity.AUTO }
    const settings = HarnessSettings.load()
    vi.spyOn(settings, 'hasSettings').mockReturnValue(true)
    vi.spyOn(settings, 'getTimeoutMs').mockReturnValue(9999)

    const invocation = { skill: 's', agent: 'a', mode: 'autonomous' as const, payload: {}, phaseKey: 'phaseA' }

    // Act
    const runSpy = vi.spyOn(fakeRunner, 'run')
    await service.invokeAgent(invocation, Phase.PLANNING, config, settings)

    // Assert
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 9999 }),
      expect.any(Object)
    )
  })

  it('TC-AIS-03: applies model and effort overrides from settings.resolve', async () => {
    // Arrange
    fakeRunner = new FakeAgentRunner()
    Object.defineProperty(fakeRunner, 'type', { value: 'claude-sdk' })
    service = new AgentInvocationService(fakeRunner, mockLedger)
    const config = { scope: 'test', projectPaths: [], complexity: Complexity.AUTO }
    const settings = HarnessSettings.load()

    vi.spyOn(settings, 'hasSettings').mockReturnValue(true)
    vi.spyOn(settings, 'resolve').mockReturnValue({
      model: 'overridden-model',
      effort: 'low',
    })

    const invocation = {
      skill: 's',
      agent: 'a',
      mode: 'autonomous' as const,
      payload: {},
      phaseKey: 'phaseB',
      model: 'original-model',
      effort: 'high'
    }

    // Act
    const runSpy = vi.spyOn(fakeRunner, 'run')
    await service.invokeAgent(invocation, Phase.DEVELOPMENT, config, settings)

    // Assert
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'overridden-model',
        effort: 'low'
      }),
      expect.any(Object)
    )
  })

  it('TC-AIS-04: appends projectPaths to additionalDirs', async () => {
    // Arrange
    const config = { scope: 'test', projectPaths: ['/project/path/1', '/project/path/2'], complexity: Complexity.AUTO }
    const settings = HarnessSettings.load()
    const invocation = {
      skill: 's',
      agent: 'a',
      mode: 'autonomous' as const,
      payload: {},
      additionalDirs: ['/custom/dir']
    }

    // Act
    const runSpy = vi.spyOn(fakeRunner, 'run')
    await service.invokeAgent(invocation, Phase.PLANNING, config, settings)

    // Assert
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalDirs: ['/custom/dir', '/project/path/1', '/project/path/2']
      }),
      expect.any(Object)
    )
  })

  it('TC-AIS-05: logs debug info when DebugContext is enabled', async () => {
    // Arrange
    DebugContext.enable()
    const config = { scope: 'test', projectPaths: ['/test-dir'], complexity: Complexity.AUTO }
    const settings = HarnessSettings.load()
    const invocation = { skill: 'my-skill', agent: 'my-agent', mode: 'autonomous' as const, payload: {} }

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    // Act
    await service.invokeAgent(invocation, Phase.PLANNING, config, settings)

    // Assert
    const debugOutput = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(debugOutput).toContain('[DEBUG] invokeAgent: agent=my-agent')
    expect(debugOutput).toContain('[DEBUG] additionalDirs: [/test-dir]')
    stderrSpy.mockRestore()
  })

  it('TC-AIS-06: records usage to ledger when present in output', async () => {
    // Arrange
    const config = { scope: 'test', projectPaths: [], complexity: Complexity.AUTO }
    const settings = HarnessSettings.load()
    const invocation = { skill: 'my-skill', agent: 'my-agent', mode: 'autonomous' as const, payload: {} }

    const mockUsage = { inputTokens: 100, outputTokens: 200, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0.005 }
    vi.spyOn(fakeRunner, 'run').mockResolvedValue({
      raw: '{}',
      usage: mockUsage
    })

    // Act
    await service.invokeAgent(invocation, Phase.PLANNING, config, settings)

    // Assert
    expect(mockLedger.record).toHaveBeenCalledWith('my-skill', 'my-agent', mockUsage)
  })
})
