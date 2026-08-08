import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GetSettingsUseCase } from '../GetSettingsUseCase'
import { UpdateSettingsUseCase } from '../UpdateSettingsUseCase'
import { HttpServerError } from '../../../domain/types'
import type { HarnessSettingsMap } from '../../../../settings/SettingsSchema'

describe('Settings Use Cases (Local Project Mode & Mandatory Identifier Rule)', () => {
  const testWorkspaceDir = join(process.cwd(), 'tests', '.temp', 'settings-use-case-test')
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.PROJECT_MAPPINGS
    delete process.env.PROJECT_BACKEND_PATH

    if (existsSync(testWorkspaceDir)) {
      rmSync(testWorkspaceDir, { recursive: true, force: true })
    }
    mkdirSync(testWorkspaceDir, { recursive: true })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    if (existsSync(testWorkspaceDir)) {
      rmSync(testWorkspaceDir, { recursive: true, force: true })
    }
  })

  describe('GetSettingsUseCase', () => {
    it('resolves registered project identifier from environment mapping and loads local .harness-kit/settings.json', async () => {
      process.env.PROJECT_MAPPINGS = JSON.stringify({
        backend: testWorkspaceDir,
      })

      const useCase = new GetSettingsUseCase()
      const result = await useCase.execute('backend')

      expect(result.project).toBe('backend')
      expect(result.settings).toBeDefined()

      const settingsFilePath = join(testWorkspaceDir, '.harness-kit', 'settings.json')
      expect(existsSync(settingsFilePath)).toBe(true)
    })

    it('accepts short agent name "antigravity" and filters settings', async () => {
      process.env.PROJECT_MAPPINGS = JSON.stringify({
        backend: testWorkspaceDir,
      })

      const useCase = new GetSettingsUseCase()
      const result = await useCase.execute('backend', 'antigravity')

      expect(result.project).toBe('backend')
      expect(result.agent).toBe('antigravity')
      expect(result.settings['antigravity']).toBeDefined()
    })

    it('throws HttpServerError(400, MISSING_PROJECT_IDENTIFIER) when project parameter is omitted', async () => {
      process.env.PROJECT_MAPPINGS = JSON.stringify({
        backend: testWorkspaceDir,
      })

      const useCase = new GetSettingsUseCase()
      await expect(useCase.execute()).rejects.toThrowError(HttpServerError)
    })

    it('throws HttpServerError(400, PROJECT_NOT_FOUND) when project identifier is not registered in environment', async () => {
      const useCase = new GetSettingsUseCase()
      await expect(useCase.execute('unregistered-project')).rejects.toThrowError(HttpServerError)
    })
  })

  describe('UpdateSettingsUseCase', () => {
    it('resolves project identifier and updates .harness-kit/settings.json file', async () => {
      process.env.PROJECT_MAPPINGS = JSON.stringify({
        backend: testWorkspaceDir,
      })

      const updateUseCase = new UpdateSettingsUseCase()
      const newSettings: HarnessSettingsMap = {
        'claude-sdk': {
          timeoutMs: 90000,
          phases: {
            PLANNING: { timeoutMs: 30000 },
          },
        },
      }

      const result = await updateUseCase.execute(newSettings, 'backend')
      expect(result.project).toBe('backend')
      expect(result.settings['claude-sdk']?.timeoutMs).toBe(90000)

      const settingsFilePath = join(testWorkspaceDir, '.harness-kit', 'settings.json')
      const fileContent = JSON.parse(readFileSync(settingsFilePath, 'utf-8'))
      expect(fileContent['claude-sdk']?.timeoutMs).toBe(90000)
    })

    it('successfully accepts short agent name "antigravity" and wraps direct settings payload', async () => {
      process.env.PROJECT_MAPPINGS = JSON.stringify({
        backend: testWorkspaceDir,
      })

      const updateUseCase = new UpdateSettingsUseCase()
      const payload: any = {
        timeoutMs: 1800000,
        phases: {
          bootstrap: { model: 'gemini-3.1-flash-lite', effort: '' },
          planning: { model: 'gemini-3.1-flash-lite', effort: '' },
        },
      }

      const result = await updateUseCase.execute(payload, 'backend', 'antigravity')
      expect(result.project).toBe('backend')
      expect(result.agent).toBe('antigravity')
      expect(result.settings['antigravity']?.timeoutMs).toBe(1800000)
      expect(result.settings['antigravity']?.phases?.bootstrap?.model).toBe('gemini-3.1-flash-lite')

      const settingsFilePath = join(testWorkspaceDir, '.harness-kit', 'settings.json')
      const fileContent = JSON.parse(readFileSync(settingsFilePath, 'utf-8'))
      expect(fileContent['antigravity']?.phases?.bootstrap?.model).toBe('gemini-3.1-flash-lite')
    })

    it('throws HttpServerError(400, MISSING_PROJECT_IDENTIFIER) when project parameter is omitted', async () => {
      const updateUseCase = new UpdateSettingsUseCase()
      await expect(updateUseCase.execute({})).rejects.toThrowError(HttpServerError)
    })
  })
})
