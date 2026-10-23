import type { AgentInvocation, AgentOutput } from './types'

/** Retry an unavailable plugin agent once using its local installation name. */
export async function runWithAgentNameFallback(
  invocation: AgentInvocation,
  execute: (invocation: AgentInvocation) => Promise<AgentOutput>,
  signal?: AbortSignal,
): Promise<AgentOutput> {
  try {
    return await execute(invocation)
  } catch (error) {
    const prefix = 'harness-kit:'
    if (!invocation.agent.startsWith(prefix) || invocation.agent.length === prefix.length) throw error
    const name = invocation.agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const unknownAgent = new RegExp(`(?:unknown agent[:\\s]+["'\\x60]?${name}(?=["'\\x60\\s)]|$)|agent[:\\s]+["'\\x60]?${name}["'\\x60]?\\s+(?:was\\s+)?not found)`, 'i')
    if (!(error instanceof Error) || !unknownAgent.test(error.message)) throw error
    signal?.throwIfAborted()
    return execute({ ...invocation, agent: invocation.agent.slice(prefix.length) })
  }
}
