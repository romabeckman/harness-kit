import type { AgentInvocation, AgentOutput, Runner } from './types'

export interface IAgentRunner {
  readonly type?: Runner
  run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput>
}
