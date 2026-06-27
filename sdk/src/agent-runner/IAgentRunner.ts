import type { AgentInvocation, AgentOutput } from './types'

export interface IAgentRunner {
  run(invocation: AgentInvocation): Promise<AgentOutput>
}
