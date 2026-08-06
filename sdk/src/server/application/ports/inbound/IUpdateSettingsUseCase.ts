import type { HarnessSettingsMap } from '../../../../settings/SettingsSchema'

export interface IUpdateSettingsUseCase {
  execute(
    settings: HarnessSettingsMap,
    projectIdentifier?: string,
    agentIdentifier?: string
  ): Promise<{ project: string; agent?: string; settings: HarnessSettingsMap }>
}
