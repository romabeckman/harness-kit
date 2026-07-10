import { AbstractCliRunner } from '../AbstractCliRunner'
import type { AgentInvocation } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../settings/DefaultSettings'

export class AntigravityCLIRunner extends AbstractCliRunner {
  readonly type = 'antigravity-cli'

  protected get binaryName(): string {
    return 'agy'
  }

  protected override get writePromptToStdin(): boolean {
    return true
  }

  protected buildArgs(prompt: string, invocation: AgentInvocation): string[] {
    const args = ['--print', prompt]
    const timeout = invocation.timeoutMs ?? DEFAULT_PHASE_TIMEOUT_MS
    
    const model = this.getModelName(invocation)
    if (model) args.push('--model', model)

    // add 1000ms to timeout to avoid throw error for 1sec difference
    args.push('--print-timeout', `${timeout + 1000}ms`)
    return args
  }
}

AgentRunnerRegistry.register({
  type: 'antigravity-cli',
  constructor: AntigravityCLIRunner,
})
