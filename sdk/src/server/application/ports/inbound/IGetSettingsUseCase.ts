import type { HarnessSettingsMap } from '../../../../settings/SettingsSchema'

export interface IGetSettingsUseCase {
  execute(projectIdentifier?: string): Promise<{ project: string; projectPath: string; settings: HarnessSettingsMap }>
}
