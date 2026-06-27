export interface AgentInvocation {
  skill: string
  agent: string
  mode: 'autonomous'
  payload: ContextPayload
  prompt?: string  // explicit prompt override (takes precedence over payload serialization)
}

export interface AgentOutput {
  raw: string
  artefacts?: Record<string, string>
  usage?: TokenUsage
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  model?: string   // extracted from modelUsage in result event
  effort?: string  // from ClaudeCodeRunnerConfig if set
}

export type ContextPayload = Record<string, unknown>
