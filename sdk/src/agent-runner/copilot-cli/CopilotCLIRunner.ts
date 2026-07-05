import { AbstractCliRunner } from '../AbstractCliRunner'
import type { AgentInvocation } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../settings/DefaultSettings'

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
      timeoutMs: config?.timeoutMs ?? DEFAULT_PHASE_TIMEOUT_MS,
      model: config?.model ?? '',
    }
    this.timeoutMs = this.#config.timeoutMs
  }

  protected get binaryName(): string {
    return this.#config.copilotBin
  }

  protected get writePromptToStdin(): boolean {
    return false
  }

  protected getModelName(invocation: AgentInvocation): string | undefined {
    return invocation.model ?? (this.#config.model || undefined)
  }

  protected buildArgs(prompt: string, invocation: AgentInvocation): string[] {
    const args = ['--prompt', prompt, '--allow-all-tools', '--autopilot']

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
