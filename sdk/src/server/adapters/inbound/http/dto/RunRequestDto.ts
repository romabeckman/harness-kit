import type { OrchestratorConfig } from '../../../../../orchestrator/types'

export interface RunRequestDto extends Partial<OrchestratorConfig> {
  mode?: string
  action?: 'reset' | 'resume'
}

export interface RunRequestDtoExtended extends RunRequestDto {
  scope?: string
  reworks?: number
  steeringMessage?: string
  agentType?: string
  model?: string
  effort?: string
  skipValidation?: boolean
  skipMemory?: boolean
  skipDeploy?: boolean
  refine?: boolean
  projectPaths?: string[]
  branch?: string
  gitUrl?: string
  useWorktree?: boolean
  project?: string
}
