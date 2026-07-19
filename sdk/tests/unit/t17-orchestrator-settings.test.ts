import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { HarnessOrchestrator } from '../../src/orchestrator/HarnessOrchestrator'
import { HarnessSettings } from '../../src/settings/HarnessSettings'
import { FakeAgentRunner } from '../helpers/FakeAgentRunner'
import type { AgentInvocation, AgentOutput } from '../../src/agent-runner/types'
import { Complexity } from '../../src/orchestrator/types'

describe('T17 — Orchestrator Settings Overrides', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `orchestrator-settings-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('applies settings overrides to agent invocations', async () => {
    const fakeRunner = new FakeAgentRunner()
    // Explicit type to match default settings or settings files
    Object.defineProperty(fakeRunner, 'type', { value: 'claude-cli', writable: true })

    const globalDir = join(tmpDir, 'global-config')
    const globalFile = join(globalDir, 'harness-kit', 'settings.json')
    vi.spyOn(HarnessSettings as any, 'getGlobalSettingsPath').mockReturnValue(globalFile)

    // Pre-create global file with specific settings
    mkdirSync(join(globalDir, 'harness-kit'), { recursive: true })
    writeFileSync(globalFile, JSON.stringify({
      'claude-cli': {
        phases: {
          bootstrap: { model: 'overridden-bootstrap-model', effort: 'low' }
        }
      }
    }))

    const settings = HarnessSettings.load(tmpDir)

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fakeRunner,
      productDir: join(tmpDir, 'docs', 'product'),
      settings,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    const bootstrapCalls = fakeRunner.invocations
    expect(bootstrapCalls.length).toBeGreaterThan(0)
    // Should have used the overridden model and effort
    expect(bootstrapCalls[0]).toHaveProperty('model', 'overridden-bootstrap-model')
    expect(bootstrapCalls[0]).toHaveProperty('effort', 'low')
  })

  it('applies custom timeoutMs configuration and aborts when timeout expires', async () => {
    const fakeRunner = new FakeAgentRunner()
    Object.defineProperty(fakeRunner, 'type', { value: 'claude-cli', writable: true })

    // Stub runner to simulate a long running task that checks abort signal
    fakeRunner.run = async (invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput> => {
      fakeRunner.invocations.push(invocation)
      return new Promise((_, reject) => {
        const check = () => {
          if (options?.signal?.aborted) {
            reject(new Error('aborted'))
          } else {
            setTimeout(check, 2)
          }
        }
        check()
      })
    }

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fakeRunner,
      productDir: join(tmpDir, 'docs', 'product'),
      timeoutMs: 10, // 10ms timeout via orchestrator config
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    await expect(orchestrator.runBootstrapOnly()).rejects.toThrow('aborted')
  })

  it('reads timeoutMs from phase settings', async () => {
    const fakeRunner = new FakeAgentRunner()
    Object.defineProperty(fakeRunner, 'type', { value: 'claude-cli', writable: true })

    fakeRunner.run = async (invocation: AgentInvocation, _options?: { signal?: AbortSignal }): Promise<AgentOutput> => {
      fakeRunner.invocations.push(invocation)
      return { success: true, stdout: 'mock', stderr: '', raw: '{}' }
    }

    const globalDir = join(tmpDir, 'global-config-timeout')
    const globalFile = join(globalDir, 'harness-kit', 'settings.json')
    vi.spyOn(HarnessSettings as any, 'getGlobalSettingsPath').mockReturnValue(globalFile)

    mkdirSync(join(globalDir, 'harness-kit'), { recursive: true })
    writeFileSync(globalFile, JSON.stringify({
      'claude-cli': {
        phases: {
          bootstrap: { timeoutMs: 9999 }
        }
      }
    }))

    const settings = HarnessSettings.load(tmpDir)

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fakeRunner,
      productDir: join(tmpDir, 'docs', 'product'),
      settings,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    const spy = vi.spyOn(global, 'setTimeout')

    await orchestrator.runBootstrapOnly()

    expect(spy).toHaveBeenCalledWith(expect.any(Function), 9999)
  })
})
