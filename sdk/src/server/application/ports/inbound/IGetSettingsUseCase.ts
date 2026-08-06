import type { HarnessSettingsMap } from '../../../../settings/SettingsSchema'

export interface IGetSettingsUseCase {
  execute(projectPath?: string): Promise<{ projectPath: string; settings: HarnessSettingsMap }>
}
