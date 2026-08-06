import type { HarnessSettingsMap } from '../../../../settings/SettingsSchema'

export interface IUpdateSettingsUseCase {
  execute(settings: HarnessSettingsMap, projectPath?: string): Promise<{ projectPath: string; settings: HarnessSettingsMap }>
}
