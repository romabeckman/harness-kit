import type { IAgentRunner } from '../../../agent-runner/IAgentRunner'
import type { QaDriver, QaProfile } from '../../../qa/types'
import type { QaTerminalPresenter } from '../../../qa/progress'
import type { QaRuntimePreparer } from '../../../qa/services/QaRuntimeManager'
import type { QaTargetProbe } from '../../../qa/services/QaTargetProbe'
import type { HarnessSettings } from '../../../settings/HarnessSettings'

export type QaAction = 'run' | 'report' | 'exploratory'
export type DevelopmentMode = 'quick' | 'fast' | 'thinking' | 'deep_thinking'
export type ConfirmOptions = { message: string; default: boolean }
export type SelectModeOptions = {
  message: string
  choices: Array<{ name: string; value: DevelopmentMode; description: string }>
  default: DevelopmentMode
}

export interface QaCliOptions {
  action: QaAction
  runId?: string
  target?: string
  profile?: QaProfile
  scope?: string
  scenarios: string[]
  projectPath?: string
  agentType?: string
  model?: string
  effort?: string
  debug?: boolean
  report: boolean
}

export interface QaCommandDependencies {
  runner?: IAgentRunner
  drivers?: QaDriver[]
  settings?: HarnessSettings
  view?: QaTerminalPresenter
  targetProbe?: QaTargetProbe
  runtime?: QaRuntimePreparer
  confirmSendToFix?: (options: ConfirmOptions) => Promise<boolean>
  confirmDevelopmentOption?: (options: ConfirmOptions) => Promise<boolean>
  selectDevelopmentMode?: (options: SelectModeOptions) => Promise<DevelopmentMode>
  runCommand?: (cwd: string, args: string[]) => Promise<void>
}
