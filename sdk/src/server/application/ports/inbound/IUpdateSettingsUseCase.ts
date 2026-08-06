import type { HarnessSettingsMap } from '../../../../settings/SettingsSchema'

export interface IUpdateSettingsUseCase {
  execute(settings: HarnessSettingsMap, projectIdentifier?: string): Promise<{ project: string; projectPath: string; settings: HarnessSettingsMap }>
}
