import type { HarnessSettingsMap } from '../../../../settings/SettingsSchema'

export interface IGetSettingsUseCase {
  execute(
    projectIdentifier?: string,
    agentIdentifier?: string
  ): Promise<{ project: string; agent?: string; settings: HarnessSettingsMap }>
}
