import type { IAgentRunner } from '../../src/agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../../src/agent-runner/types'

export interface FakeInvocationRecord {
  skill?: string
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

  setResponse(skill: string, output: AgentOutput): void {
    this.responses.set(skill, output)
  }

  enqueueResponse(skill: string, output: AgentOutput): void {
    const q = this.callQueue.get(skill) ?? []
    q.push(output)
    this.callQueue.set(skill, q)
  }

  setDefault(output: AgentOutput): void {
    this.defaultOutput = output
  }

  async run(invocation: AgentInvocation, _options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    this.invocations.push({
      skill: invocation.skill,
      agent: invocation.agent,
      payload: invocation.payload,
      prompt: invocation.prompt,
      model: invocation.model,
      effort: invocation.effort,
    })

    const skill = invocation.skill ?? ''
    const cleanSkill = skill.replace(/^harness-kit:/, '')

    // Check queue first
    const q = this.callQueue.get(skill) ?? this.callQueue.get(cleanSkill)
    if (q && q.length > 0) {
      return q.shift()!
    }

    // Check fixed responses
    const fixed = this.responses.get(skill) ?? this.responses.get(cleanSkill)
    if (fixed) return fixed

    return this.defaultOutput
  }

  getInvocationsForSkill(skill: string): FakeInvocationRecord[] {
    const cleanTarget = skill.replace(/^harness-kit:/, '')
    return this.invocations.filter(i => {
      const cleanSkill = (i.skill ?? '').replace(/^harness-kit:/, '')
      return cleanSkill === cleanTarget
    })
  }

  reset(): void {
    this.invocations = []
    this.responses.clear()
    this.callQueue.clear()
  }
}
