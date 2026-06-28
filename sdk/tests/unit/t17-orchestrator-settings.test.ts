import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { HarnessOrchestrator } from '../../src/orchestrator/HarnessOrchestrator'
import { HarnessSettings } from '../../src/settings/HarnessSettings'
import { FakeAgentRunner } from '../helpers/FakeAgentRunner'

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
    Object.defineProperty(fakeRunner, 'type', { value: 'claude-code', writable: true })

    const globalDir = join(tmpDir, 'global-config')
    const globalFile = join(globalDir, 'harness-kit', 'settings.json')
    vi.spyOn(HarnessSettings as any, 'getGlobalSettingsPath').mockReturnValue(globalFile)

    // Pre-create global file with specific settings
    mkdirSync(join(globalDir, 'harness-kit'), { recursive: true })
    writeFileSync(globalFile, JSON.stringify({
      'claude-code': {
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
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    const bootstrapCalls = fakeRunner.invocations
    expect(bootstrapCalls.length).toBeGreaterThan(0)
    // Should have used the overridden model and effort
    expect(bootstrapCalls[0]).toHaveProperty('model', 'overridden-bootstrap-model')
    expect(bootstrapCalls[0]).toHaveProperty('effort', 'low')
  })
})
