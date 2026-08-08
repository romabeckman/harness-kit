import type { OrchestratorConfig } from '../../../../../orchestrator/types'

export interface RunRequestDto extends Partial<OrchestratorConfig> {
  mode?: string
  action?: 'reset' | 'resume'
}

export interface RunRequestDtoExtended extends RunRequestDto {
  idempotencyKey: string
  scope: string
  project: string | string[]
  agent: string
  reworks?: number
  steeringMessage?: string
  model?: string
  effort?: string
  skipValidation?: boolean
  skipMemory?: boolean
}
