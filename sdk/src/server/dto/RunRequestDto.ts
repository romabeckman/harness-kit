export interface RunRequestDto {
  scope?: string
  projectPaths?: string[]
  mode?: 'quick' | 'fast' | 'thinking' | 'deep_thinking'
  action?: 'reset' | 'resume'
  score?: number
  reworks?: number
}

export interface RunRequestDtoExtended extends RunRequestDto {
  steeringMessage?: string
  agentType?: string
  model?: string
  effort?: string
  skipValidation?: boolean
  skipMemory?: boolean
  skipDeploy?: boolean
  refine?: boolean
  branch?: string
  gitUrl?: string
  useWorktree?: boolean
  project?: string
}
