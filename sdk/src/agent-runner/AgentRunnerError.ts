export enum AgentRunnerErrorCode {
  MISSING_API_KEY = 'MISSING_API_KEY',
  TIMEOUT         = 'TIMEOUT',
  API_ERROR       = 'API_ERROR',
  NETWORK_ERROR   = 'NETWORK_ERROR',
}

export class AgentRunnerError extends Error {
  readonly code: AgentRunnerErrorCode
  readonly skill: string
  readonly phase: string
  readonly cause: Error | undefined

  constructor(params: {
    code: AgentRunnerErrorCode
    skill: string
    phase: string
    message: string
    cause?: Error
  }) {
    super(params.message)
    this.name = 'AgentRunnerError'
    this.code = params.code
    this.skill = params.skill
    this.phase = params.phase
    this.cause = params.cause
  }
}
