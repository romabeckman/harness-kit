import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('T28 — HarnessSettings', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('TC-HS-01: getGlobalSettingsPath checks HARNESS_SETTINGS_PATH env', async () => {
    process.env.HARNESS_SETTINGS_PATH = '/custom/path/settings.json'
    const { HarnessSettings } = await import('../../src/settings/HarnessSettings.js')
    expect(HarnessSettings.getGlobalSettingsPath()).toBe('/custom/path/settings.json')
  })

  it('TC-HS-02: getGlobalSettingsPath checks XDG_CONFIG_HOME env', async () => {
    delete process.env.HARNESS_SETTINGS_PATH
    process.env.XDG_CONFIG_HOME = '/xdg/config'
    const { HarnessSettings } = await import('../../src/settings/HarnessSettings.js')
    const path = HarnessSettings.getGlobalSettingsPath().replace(/\\/g, '/')
    expect(path).toContain('/xdg/config')
    expect(path).toContain('settings.json')
  })

  it('TC-HS-03: hasSettings checks runner existence', async () => {
    const { HarnessSettings } = await import('../../src/settings/HarnessSettings.js')
    const settings = (HarnessSettings as any).load()
    // By default, it loads settings (and creates default global settings in a test env if not present)
    expect(settings.hasSettings('claude')).toBe(true)
    expect(settings.hasSettings('unknown-runner')).toBe(false)
  })

  it('TC-HS-04: resolve returns runner phase settings', async () => {
    const { HarnessSettings } = await import('../../src/settings/HarnessSettings.js')
    // Instantiate with custom map to test logic directly
    const customMap = {
      'my-runner': {
        timeoutMs: 5000,
        phases: {
          'phaseA': { timeoutMs: 2000, model: 'gpt-4' }
        }
      }
    }
    const settings = new (HarnessSettings as any)(customMap)

    expect(settings.resolve('my-runner', 'phaseA')).toEqual({ timeoutMs: 2000, model: 'gpt-4' })
    expect(settings.resolve('my-runner', 'unknownPhase')).toEqual({})
    expect(settings.resolve('unknown-runner', 'phaseA')).toEqual({})
  })

  it('TC-HS-05: getTimeoutMs retrieves phase-specific or runner-specific timeouts', async () => {
    const { HarnessSettings } = await import('../../src/settings/HarnessSettings.js')
    const customMap = {
      'my-runner': {
        timeoutMs: 5000,
        phases: {
          'phaseA': { timeoutMs: 2000 },
          'phaseB': {} // no timeoutMs
        }
      }
    }
    const settings = new (HarnessSettings as any)(customMap)

    expect(settings.getTimeoutMs('my-runner', 'phaseA')).toBe(2000)
    expect(settings.getTimeoutMs('my-runner', 'phaseB')).toBe(5000)
    expect(settings.getTimeoutMs('my-runner')).toBe(5000)
    expect(settings.getTimeoutMs('unknown-runner')).toBeUndefined()
  })

  it('TC-HS-06: mergeMaps merges base and overrides', async () => {
    const { HarnessSettings } = await import('../../src/settings/HarnessSettings.js')
    const base = {
      'claude-cli': {
        timeoutMs: 1000,
        phases: {
          'phaseA': { model: 'base-model', timeoutMs: 500 }
        }
      }
    }
    const override = {
      'claude-cli': {
        timeoutMs: 2000,
        phases: {
          'phaseA': { model: 'override-model' },
          'phaseB': { model: 'phaseB-model' }
        }
      }
    }

    const merged = (HarnessSettings as any).mergeMaps(base, override)

    expect(merged['claude-cli'].timeoutMs).toBe(2000)
    expect(merged['claude-cli'].phases['phaseA']).toEqual({
      model: 'override-model',
      timeoutMs: 500
    })
    expect(merged['claude-cli'].phases['phaseB']).toEqual({
      model: 'phaseB-model'
    })
  })

  it('TC-HS-07: createLocalSettings creates local settings in project path', async () => {
    const { HarnessSettings } = await import('../../src/settings/HarnessSettings.js')
    const { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')

    const tmpDir = mkdtempSync(join(tmpdir(), 'harness-kit-test-'))
    
    try {
      const createdPath = HarnessSettings.createLocalSettings(tmpDir)
      expect(existsSync(createdPath)).toBe(true)
      expect(createdPath).toBe(join(tmpDir, '.harness-kit', 'settings.json'))
      
      const content = readFileSync(createdPath, 'utf-8')
      expect(content).toContain('"claude"')
      
      // Test it doesn't overwrite if it exists
      writeFileSync(createdPath, '{"custom": true}')
      HarnessSettings.createLocalSettings(tmpDir)
      const newContent = readFileSync(createdPath, 'utf-8')
      expect(newContent).toBe('{"custom": true}')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
