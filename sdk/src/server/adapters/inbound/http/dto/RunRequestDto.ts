import type { OrchestratorConfig } from '../../../../../orchestrator/types'

export interface RunRequestDto extends Partial<OrchestratorConfig> {
  mode?: string
  action?: 'reset' | 'resume'
}

export interface RunRequestDtoExtended extends RunRequestDto {
  scope?: string
  reworks?: number
  steeringMessage?: string
  agent?: string
  model?: string
  effort?: string
  skipValidation?: boolean
  skipMemory?: boolean
  skipDeploy?: boolean
  branch?: string
  useWorktree?: boolean
  project?: string | string[]
}
