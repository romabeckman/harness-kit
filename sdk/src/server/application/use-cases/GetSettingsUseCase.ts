import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HarnessSettings } from '../../../settings/HarnessSettings'
import type { HarnessSettingsMap } from '../../../settings/SettingsSchema'
import { HttpServerError, HttpServerConfig } from '../../domain/types'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import type { IGetSettingsUseCase } from '../ports/inbound/IGetSettingsUseCase'

export class GetSettingsUseCase implements IGetSettingsUseCase {
  constructor(private config?: HttpServerConfig) {}

  async execute(projectIdentifier?: string): Promise<{ project: string; projectPath: string; settings: HarnessSettingsMap }> {
    const targetPath = this.resolveProjectPath(projectIdentifier)
    const settingsFilePath = join(targetPath, '.harness-kit', 'settings.json')

    if (!existsSync(settingsFilePath)) {
      HarnessSettings.createLocalSettings(targetPath)
    }

    let settings: HarnessSettingsMap = {}
    try {
      const content = readFileSync(settingsFilePath, 'utf-8')
      settings = JSON.parse(content) as HarnessSettingsMap
    } catch {
      const fallbackSettings = HarnessSettings.load(targetPath)
      settings = (fallbackSettings as any).settings ?? {}
    }

    return {
      project: projectIdentifier ?? 'default',
      projectPath: targetPath,
      settings,
    }
  }

  private resolveProjectPath(projectIdentifier?: string): string {
    if (projectIdentifier && projectIdentifier.trim() !== '') {
      const fromEnv = DtoMappers.resolveProjectFromEnv(projectIdentifier)
      if (fromEnv?.path) {
        return resolve(fromEnv.path)
      }
      throw new HttpServerError(
        400,
        'PROJECT_NOT_FOUND',
        `Project identifier '${projectIdentifier}' is not registered in server environment (PROJECT_MAPPINGS or PROJECT_<NAME>_PATH).`
      )
    }
    if (this.config?.allowedWorkspaces && this.config.allowedWorkspaces.length > 0) {
      return resolve(this.config.allowedWorkspaces[0])
    }
    return process.cwd()
  }
}
