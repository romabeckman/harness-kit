import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GetSettingsUseCase } from '../GetSettingsUseCase'
import { UpdateSettingsUseCase } from '../UpdateSettingsUseCase'
import type { HarnessSettingsMap } from '../../../../settings/SettingsSchema'

describe('Settings Use Cases (Local Project Mode)', () => {
  const testWorkspaceDir = join(process.cwd(), 'tests', '.temp', 'settings-use-case-test')

  beforeEach(() => {
    if (existsSync(testWorkspaceDir)) {
      rmSync(testWorkspaceDir, { recursive: true, force: true })
    }
    mkdirSync(testWorkspaceDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testWorkspaceDir)) {
      rmSync(testWorkspaceDir, { recursive: true, force: true })
    }
  })

  describe('GetSettingsUseCase', () => {
    it('creates local .harness-kit/settings.json with defaults if not present and returns settings', async () => {
      const useCase = new GetSettingsUseCase()
      const result = await useCase.execute(testWorkspaceDir)

      expect(result.projectPath).toBe(testWorkspaceDir)
      expect(result.settings).toBeDefined()

      const settingsFilePath = join(testWorkspaceDir, '.harness-kit', 'settings.json')
      expect(existsSync(settingsFilePath)).toBe(true)
    })

    it('reads existing local .harness-kit/settings.json configuration', async () => {
      const settingsFilePath = join(testWorkspaceDir, '.harness-kit', 'settings.json')
      mkdirSync(join(testWorkspaceDir, '.harness-kit'), { recursive: true })

      const customSettings: HarnessSettingsMap = {
        'claude-cli': {
          timeoutMs: 60000,
          phases: {
            DEVELOPMENT: { timeoutMs: 120000 },
          },
        },
      }
      const fs = await import('node:fs')
      fs.writeFileSync(settingsFilePath, JSON.stringify(customSettings, null, 2), 'utf-8')

      const useCase = new GetSettingsUseCase()
      const result = await useCase.execute(testWorkspaceDir)

      expect(result.settings['claude-cli']).toBeDefined()
      expect(result.settings['claude-cli']?.timeoutMs).toBe(60000)
    })
  })

  describe('UpdateSettingsUseCase', () => {
    it('saves/updates model settings in local project .harness-kit/settings.json file', async () => {
      const getUseCase = new GetSettingsUseCase()
      await getUseCase.execute(testWorkspaceDir)

      const updateUseCase = new UpdateSettingsUseCase()
      const newSettings: HarnessSettingsMap = {
        'claude-sdk': {
          timeoutMs: 90000,
          phases: {
            PLANNING: { timeoutMs: 30000 },
          },
        },
      }

      const result = await updateUseCase.execute(newSettings, testWorkspaceDir)
      expect(result.projectPath).toBe(testWorkspaceDir)
      expect(result.settings['claude-sdk']?.timeoutMs).toBe(90000)

      const settingsFilePath = join(testWorkspaceDir, '.harness-kit', 'settings.json')
      const fileContent = JSON.parse(readFileSync(settingsFilePath, 'utf-8'))
      expect(fileContent['claude-sdk']?.timeoutMs).toBe(90000)
    })
  })
})
