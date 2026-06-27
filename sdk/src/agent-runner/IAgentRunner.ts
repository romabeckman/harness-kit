import type { AgentInvocation, AgentOutput } from './types'

export interface IAgentRunner {
  run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput>
}
