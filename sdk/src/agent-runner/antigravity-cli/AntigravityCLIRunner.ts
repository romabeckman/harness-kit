import { AbstractCliRunner } from '../AbstractCliRunner'
import { Runner, type AgentInvocation } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../settings/DefaultSettings'

export class AntigravityCLIRunner extends AbstractCliRunner {
  readonly type = Runner.ANTIGRAVITY_CLI

  protected get binaryName(): string {
    return 'agy'
  }

  protected buildArgs(prompt: string, invocation: AgentInvocation): string[] {
    const args = []
    const timeout = invocation.timeoutMs ?? DEFAULT_PHASE_TIMEOUT_MS

    const model = this.getModelName(invocation)
    if (model) args.push('--model', model)

    // add 1000ms to timeout to avoid throw error for 1sec difference
    args.push('--print-timeout', `${timeout + 1000}ms`)
    args.push('--dangerously-skip-permissions')
    args.push('--agent', invocation.agent)
    args.push('-p', prompt)
    return args
  }
}

AgentRunnerRegistry.register({
  type: Runner.ANTIGRAVITY_CLI,
  constructor: AntigravityCLIRunner,
})
