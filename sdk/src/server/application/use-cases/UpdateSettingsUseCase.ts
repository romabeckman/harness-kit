import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { HttpServerError, HttpServerConfig } from '../../domain/types'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import type { HarnessSettingsMap } from '../../../settings/SettingsSchema'
import type { IUpdateSettingsUseCase } from '../ports/inbound/IUpdateSettingsUseCase'

export class UpdateSettingsUseCase implements IUpdateSettingsUseCase {
  constructor(private config?: HttpServerConfig) {}

  async execute(
    settingsPayload: HarnessSettingsMap,
    projectIdentifier?: string
  ): Promise<{ project: string; projectPath: string; settings: HarnessSettingsMap }> {
    const targetPath = this.resolveProjectPath(projectIdentifier)

    if (this.config?.allowedWorkspaces && this.config.allowedWorkspaces.length > 0) {
      const allowed = this.config.allowedWorkspaces.some((ws) => targetPath.startsWith(ws))
      if (!allowed) {
        throw new HttpServerError(
          400,
          'PATH_TRAVERSAL_DETECTED',
          `Target path '${targetPath}' is outside allowed workspaces`
        )
      }
    }

    const settingsFilePath = join(targetPath, '.harness-kit', 'settings.json')
    if (!existsSync(dirname(settingsFilePath))) {
      mkdirSync(dirname(settingsFilePath), { recursive: true })
    }

    let existingSettings: HarnessSettingsMap = {}
    if (existsSync(settingsFilePath)) {
      try {
        existingSettings = JSON.parse(readFileSync(settingsFilePath, 'utf-8'))
      } catch {}
    }

    const mergedSettings: HarnessSettingsMap = {
      ...existingSettings,
      ...settingsPayload,
    }

    writeFileSync(settingsFilePath, JSON.stringify(mergedSettings, null, 2), 'utf-8')
    return {
      project: projectIdentifier ?? 'default',
      projectPath: targetPath,
      settings: mergedSettings,
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
