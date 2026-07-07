import { DEFAULT_PHASE_TIMEOUT_MS } from "../../settings/DefaultSettings"

export interface AgentRunnerConfig {
  readonly model: string
  readonly timeoutMs: number
  readonly max_output_token: number
}

export const DEFAULT_AGENT_RUNNER_CONFIG: AgentRunnerConfig = Object.freeze({
  model: 'claude-sonnet-4-6',
  timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
  max_output_token: 8192
})
