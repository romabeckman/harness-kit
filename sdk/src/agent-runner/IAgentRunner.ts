import type { AgentInvocation, AgentOutput, Runner } from './types'

export interface IAgentRunner {
  readonly type?: Runner
  readonly writePromptToStdin?: boolean
  run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput>
}
