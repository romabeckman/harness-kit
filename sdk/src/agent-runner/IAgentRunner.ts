import type { AgentInvocation, AgentOutput } from './types'

export interface IAgentRunner {
  readonly type?: string
  run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput>
}
