import { AbstractCliRunner } from '../AbstractCliRunner'
import type { AgentInvocation } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'

export class CopilotCLIRunner extends AbstractCliRunner {
  readonly type = 'copilot-cli'

  protected get binaryName(): string {
    return 'copilot'
  }

  protected get writePromptToStdin(): boolean {
    return false
  }

  protected buildArgs(prompt: string, invocation: AgentInvocation): string[] {
    const args = ['--prompt', prompt, '--allow-all-tools', '--autopilot']

    if (invocation.model) args.push('--model', invocation.model)
    if (invocation.effort) args.push('--reasoning-effort', invocation.effort)
    if (invocation.agent) args.push('--agent', invocation.agent)
    for (const dir of invocation.additionalDirs ?? []) args.push('--add-dir', dir)

    return args
  }
}

AgentRunnerRegistry.register({
  type: 'copilot-cli',
  constructor: CopilotCLIRunner,
})
