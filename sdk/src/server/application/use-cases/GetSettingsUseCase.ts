import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HarnessSettings } from '../../../settings/HarnessSettings'
import type { HarnessSettingsMap } from '../../../settings/SettingsSchema'
import type { HttpServerConfig } from '../../domain/types'
import type { IGetSettingsUseCase } from '../ports/inbound/IGetSettingsUseCase'

export class GetSettingsUseCase implements IGetSettingsUseCase {
  constructor(private config?: HttpServerConfig) {}

  async execute(projectPath?: string): Promise<{ projectPath: string; settings: HarnessSettingsMap }> {
    const targetPath = this.resolveProjectPath(projectPath)
    const settingsFilePath = join(targetPath, '.harness-kit', 'settings.json')

    if (!existsSync(settingsFilePath)) {
      HarnessSettings.createLocalSettings(targetPath)
    }

    try {
      const content = readFileSync(settingsFilePath, 'utf-8')
      const settings = JSON.parse(content) as HarnessSettingsMap
      return { projectPath: targetPath, settings }
    } catch {
      const fallbackSettings = HarnessSettings.load(targetPath)
      return { projectPath: targetPath, settings: (fallbackSettings as any).settings ?? {} }
    }
  }

  private resolveProjectPath(projectPath?: string): string {
    if (projectPath && projectPath.trim() !== '') {
      return resolve(projectPath)
    }
    if (this.config?.allowedWorkspaces && this.config.allowedWorkspaces.length > 0) {
      return resolve(this.config.allowedWorkspaces[0])
    }
    return process.cwd()
  }
}
