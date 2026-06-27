import type { IAgentRunner } from './IAgentRunner'
import type { AgentInvocation, AgentOutput } from './types'

export class NullAgentRunner implements IAgentRunner {
  async run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    throw new Error(
      `NotImplementedError: NullAgentRunner cannot execute skill "${invocation.skill}". ` +
      `Provide a concrete IAgentRunner implementation (see F003).`
    )
  }
}
