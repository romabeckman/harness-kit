export interface BaseRunnerConfig {
  readonly type: string
  readonly timeoutMs?: number
}

export type RunnerConfig = BaseRunnerConfig & Record<string, any>

export interface AgentInvocation {
  readonly agent: string
  readonly mode: 'autonomous'
  readonly skill?: string
  readonly payload?: ContextPayload
  readonly prompt?: string  // explicit prompt override (takes precedence over payload serialization)
  readonly workspacePath?: string
  readonly env?: Record<string, string>
  readonly model?: string
  readonly effort?: string
  readonly phaseKey?: string
  readonly timeoutMs?: number
  readonly additionalDirs?: string[]
}

export interface AgentOutput {
  readonly success: boolean
  readonly stdout: string
  readonly stderr: string
  readonly raw: string
  readonly artefacts?: Record<string, string>
  readonly usage?: TokenUsage
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  model?: string   // extracted from modelUsage in result event
  effort?: string  // from ClaudeCLIRunnerConfig if set
}

export type ContextPayload = Record<string, unknown>

