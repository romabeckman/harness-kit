import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HarnessSettings } from '../../../settings/HarnessSettings'
import { DEFAULT_SETTINGS } from '../../../settings/DefaultSettings'
import type { HarnessSettingsMap } from '../../../settings/SettingsSchema'
import { HttpServerError, HttpServerConfig } from '../../domain/types'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import type { IGetSettingsUseCase } from '../ports/inbound/IGetSettingsUseCase'

export class GetSettingsUseCase implements IGetSettingsUseCase {
  constructor(private config?: HttpServerConfig) {}

  async execute(projectIdentifier?: string): Promise<{ project: string; projectPath: string; settings: HarnessSettingsMap }> {
    if (!projectIdentifier || projectIdentifier.trim() === '') {
      throw new HttpServerError(
        400,
        'MISSING_PROJECT_IDENTIFIER',
        `Project identifier query parameter 'project' is required (e.g. GET /orchestrator/settings?project=backend).`
      )
    }

    const name = projectIdentifier.trim()
    const fromEnv = DtoMappers.resolveProjectFromEnv(name, this.config?.allowedWorkspaces)
    if (!fromEnv?.path) {
      throw new HttpServerError(
        400,
        'PROJECT_NOT_FOUND',
        `Project identifier '${name}' is not registered in server environment (PROJECT_MAPPINGS, PROJECT_${name.toUpperCase()}_PATH, or ALLOWED_WORKSPACES).`
      )
    }

    const targetPath = resolve(fromEnv.path)
    const settingsFilePath = join(targetPath, '.harness-kit', 'settings.json')

    if (!existsSync(settingsFilePath)) {
      HarnessSettings.createLocalSettings(targetPath)
    }

    let settings: HarnessSettingsMap = {}
    try {
      const content = readFileSync(settingsFilePath, 'utf-8')
      settings = JSON.parse(content) as HarnessSettingsMap
    } catch {
      settings = DEFAULT_SETTINGS
    }

    return {
      project: name,
      projectPath: targetPath,
      settings,
    }
  }
}
