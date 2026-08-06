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
    const { name, path: targetPath } = this.resolveProject(projectIdentifier)
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
      project: name,
      projectPath: targetPath,
      settings,
    }
  }

  private resolveProject(projectIdentifier?: string): { name: string; path: string } {
    if (projectIdentifier && projectIdentifier.trim() !== '') {
      const fromEnv = DtoMappers.resolveProjectFromEnv(projectIdentifier)
      if (fromEnv?.path) {
        return { name: projectIdentifier.trim(), path: resolve(fromEnv.path) }
      }
      throw new HttpServerError(
        400,
        'PROJECT_NOT_FOUND',
        `Project identifier '${projectIdentifier}' is not registered in server environment (PROJECT_MAPPINGS or PROJECT_<NAME>_PATH).`
      )
    }

    // If no project specified, try to resolve single project from PROJECT_MAPPINGS
    if (process.env.PROJECT_MAPPINGS) {
      try {
        const mappings = JSON.parse(process.env.PROJECT_MAPPINGS)
        const keys = Object.keys(mappings)
        if (keys.length === 1) {
          const singleKey = keys[0]
          const entry = mappings[singleKey]
          const pathStr = typeof entry === 'string' ? entry : entry?.path
          if (pathStr) {
            return { name: singleKey, path: resolve(pathStr) }
          }
        }
      } catch {}
    }

    // Try single workspace from allowedWorkspaces
    if (this.config?.allowedWorkspaces && this.config.allowedWorkspaces.length === 1) {
      return { name: 'default', path: resolve(this.config.allowedWorkspaces[0]) }
    }

    throw new HttpServerError(
      400,
      'MISSING_PROJECT_IDENTIFIER',
      `Project identifier query parameter 'project' is required (e.g. GET /orchestrator/settings?project=backend).`
    )
  }
}
