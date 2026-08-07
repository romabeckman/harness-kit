export interface BaseRunnerConfig {
  readonly type: string
  readonly timeoutMs?: number
}

export type RunnerConfig = BaseRunnerConfig & Record<string, any>

export interface AgentInvocation {
  readonly agent: string
  readonly mode: 'autonomous' | 'default'
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
  readonly domain?: string
}

export interface AgentOutput {
  readonly success?: boolean
  readonly stdout?: string
  readonly stderr?: string
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

export enum Runner {
  ANTIGRAVITY_CLI = 'antigravity-cli',
  CLAUDE_CLI = 'claude-cli',
  CLAUDE_SDK = 'claude-sdk',
  CODEX_CLI = 'codex-cli',
  COPILOT_CLI = 'copilot-cli',
  COPILOT_SDK = 'copilot-sdk',
  CURSOR_CLI = 'cursor-cli',
  CURSOR_SDK = 'cursor-sdk',
  KIRO_CLI = 'kiro-cli',
}

export type ContextPayload = Record<string, unknown>

