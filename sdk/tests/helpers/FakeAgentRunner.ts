import type { IAgentRunner } from '../../src/agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../../src/agent-runner/types'

export interface FakeInvocationRecord {
  skill: string
  agent: string
  payload?: Record<string, unknown>
  prompt?: string
  model?: string
  effort?: string
}

export class FakeAgentRunner implements IAgentRunner {
  private responses: Map<string, AgentOutput> = new Map()
  private callQueue: Map<string, AgentOutput[]> = new Map()
  public invocations: FakeInvocationRecord[] = []
  private defaultOutput: AgentOutput = {
    raw: JSON.stringify({ score: 0.85, scoreTL: 0.85, scoreAdv: 0.85 }),
  }

  /**
   * Configure a fixed response for a skill name.
   */
  setResponse(skill: string, output: AgentOutput): void {
    this.responses.set(skill, output)
  }

  /**
   * Configure a sequence of responses for a skill.
   * First call returns queue[0], second call returns queue[1], etc.
   * Falls back to setResponse if queue exhausted.
   */
  enqueueResponse(skill: string, output: AgentOutput): void {
    const q = this.callQueue.get(skill) ?? []
    q.push(output)
    this.callQueue.set(skill, q)
  }

  setDefault(output: AgentOutput): void {
    this.defaultOutput = output
  }

  async run(invocation: AgentInvocation): Promise<AgentOutput> {
    this.invocations.push({
      skill: invocation.skill,
      agent: invocation.agent,
      payload: invocation.payload,
      prompt: invocation.prompt,
      model: invocation.model,
      effort: invocation.effort,
    })

    // Check queue first
    const q = this.callQueue.get(invocation.skill)
    if (q && q.length > 0) {
      return q.shift()!
    }

    // Check fixed responses
    const fixed = this.responses.get(invocation.skill)
    if (fixed) return fixed

    return this.defaultOutput
  }

  getInvocationsForSkill(skill: string): FakeInvocationRecord[] {
    return this.invocations.filter(i => i.skill === skill)
  }

  reset(): void {
    this.invocations = []
    this.responses.clear()
    this.callQueue.clear()
  }
}
