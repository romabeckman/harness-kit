export interface AgentRunnerConfig {
  readonly model: string
  readonly timeoutMs: number
}

export const DEFAULT_AGENT_RUNNER_CONFIG: AgentRunnerConfig = Object.freeze({
  model: 'claude-sonnet-4-6',
  timeoutMs: 300_000,
})
