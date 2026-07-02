import { AbstractCliRunner } from '../AbstractCliRunner'
import type { AgentInvocation } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'

export interface CopilotCLIRunnerConfig {
  readonly copilotBin?: string
  readonly timeoutMs?: number
  readonly model?: string
}

export class CopilotCLIRunner extends AbstractCliRunner {
  readonly type = 'copilot-cli'
  readonly #config: Required<CopilotCLIRunnerConfig>

  constructor(config?: Partial<CopilotCLIRunnerConfig>) {
    super()
    this.#config = {
      copilotBin: config?.copilotBin ?? 'copilot',
      timeoutMs: config?.timeoutMs ?? 0,
      model: config?.model ?? '',
    }
  }

  protected get binaryName(): string {
    return this.#config.copilotBin
  }

  protected get timeoutMs(): number {
    return this.#config.timeoutMs
  }

  protected get writePromptToStdin(): boolean {
    return false
  }

  protected getModelName(invocation: AgentInvocation): string | undefined {
    return invocation.model ?? (this.#config.model || undefined)
  }

  protected buildArgs(prompt: string, invocation: AgentInvocation): string[] {
    const args = ['--prompt', prompt, '--allow-all-tools']

    const model = invocation.model ?? (this.#config.model || undefined)
    if (model) {
      args.push('--model', model)
    }

    if (invocation.effort) {
      args.push('--reasoning-effort', invocation.effort)
    }

    if (invocation.agent) args.push('--agent', invocation.agent)
    for (const dir of invocation.additionalDirs ?? []) args.push('--add-dir', dir)

    return args
  }
}

AgentRunnerRegistry.register({
  type: 'copilot-cli',
  constructor: CopilotCLIRunner,
})
