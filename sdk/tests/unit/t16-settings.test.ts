import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'path'
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { HarnessSettings } from '../../src/settings/HarnessSettings'
import { DEFAULT_SETTINGS } from '../../src/settings/DefaultSettings'

describe('T16 — HarnessSettings', () => {
  let tmpDir: string
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    tmpDir = join(tmpdir(), `harness-settings-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('generates default global config if it does not exist', () => {
    const globalDir = join(tmpDir, 'global-config')
    const globalFile = join(globalDir, 'harness-kit', 'settings.json')
    process.env.HARNESS_SETTINGS_PATH = globalFile

    expect(existsSync(globalFile)).toBe(false)

    const settings = HarnessSettings.load(tmpDir)

    expect(existsSync(globalFile)).toBe(true)
    const resolved = settings.resolve('claude', 'bootstrap')
    expect(resolved).toEqual(DEFAULT_SETTINGS['claude']?.phases?.['bootstrap'])
  })

  it('merges project config over global config', () => {
    const globalDir = join(tmpDir, 'global-config')
    const globalFile = join(globalDir, 'harness-kit', 'settings.json')
    process.env.HARNESS_SETTINGS_PATH = globalFile

    // Pre-create global file with specific settings
    mkdirSync(join(globalDir, 'harness-kit'), { recursive: true })
    writeFileSync(globalFile, JSON.stringify({
      'claude': {
        phases: {
          bootstrap: { model: 'claude-3-5-sonnet-latest', effort: 'high' },
          PLANNING: { model: 'claude-3-5-sonnet-latest', effort: 'high' }
        }
      }
    }))

    // Pre-create project file with override
    const projectDir = join(tmpDir, '.harness-kit')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'settings.json'), JSON.stringify({
      'claude': {
        phases: {
          PLANNING: { model: 'claude-opus-override', effort: 'medium' }
        }
      }
    }))

    const settings = HarnessSettings.load(tmpDir)

    // Un-overridden resolves to global
    expect(settings.resolve('claude', 'bootstrap')).toEqual({
      model: 'claude-3-5-sonnet-latest',
      effort: 'high'
    })

    // Overridden resolves to project
    expect(settings.resolve('claude', 'PLANNING')).toEqual({
      model: 'claude-opus-override',
      effort: 'medium'
    })
  })

  it('handles missing runner or phase gracefully by returning empty object', () => {
    const globalDir = join(tmpDir, 'global-config')
    const globalFile = join(globalDir, 'harness-kit', 'settings.json')
    process.env.HARNESS_SETTINGS_PATH = globalFile

    const settings = HarnessSettings.load(tmpDir)

    expect(settings.resolve('non-existent-runner', 'PLANNING')).toEqual({})
    expect(settings.resolve('claude', 'non-existent-phase')).toEqual({})
  })

  it('resolves codex default settings', () => {
    const globalDir = join(tmpDir, 'global-config')
    const globalFile = join(globalDir, 'harness-kit', 'settings.json')
    process.env.HARNESS_SETTINGS_PATH = globalFile

    const settings = HarnessSettings.load(tmpDir)

    expect(settings.resolve('codex', 'planning')).toEqual({
      model: 'gpt-5.6-sol',
      effort: 'high',
    })
    expect(settings.resolve('codex', 'implementation')).toEqual({
      model: 'gpt-5.6-luna',
      effort: 'xhigh',
    })
  })

  it('resolves diagnose settings for runners', () => {
    const globalDir = join(tmpDir, 'global-config')
    const globalFile = join(globalDir, 'harness-kit', 'settings.json')
    process.env.HARNESS_SETTINGS_PATH = globalFile

    const settings = HarnessSettings.load(tmpDir)

    expect(settings.resolve('claude', 'diagnose')).toEqual({
      model: 'anthropic.claude-5-sonnet',
      effort: 'low',
    })
    expect(settings.resolve('antigravity', 'diagnose')).toEqual({
      model: 'gemini-3.7-flash',
      effort: 'low',
    })
    expect(settings.resolve('copilot', 'diagnose')).toEqual({
      model: 'gpt-5.6-luna',
      effort: 'xhigh',
    })
  })
})
