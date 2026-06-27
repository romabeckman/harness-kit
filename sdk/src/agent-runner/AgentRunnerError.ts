export enum AgentRunnerErrorCode {
  MISSING_API_KEY = 'MISSING_API_KEY',
  TIMEOUT         = 'TIMEOUT',
  API_ERROR       = 'API_ERROR',      // 4xx semantic errors (except 429)
  NETWORK_ERROR   = 'NETWORK_ERROR',  // connection failures (ENOENT, ECONNREFUSED)
  QUOTA_EXCEEDED  = 'QUOTA_EXCEEDED', // 429 / rate-limit / quota exhaustion
  UNKNOWN_ERROR   = 'UNKNOWN_ERROR',  // fallback for unrecognised errors
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
