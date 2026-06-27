import { AbstractCliRunner } from '../AbstractCliRunner'
import type { AgentInvocation } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'

export interface AntigravityRunnerConfig {
  readonly timeoutMs?: number
  readonly agyBin?: string
  readonly model?: string
}

export class AntigravityRunner extends AbstractCliRunner {
  readonly #config: Required<AntigravityRunnerConfig>

  constructor(config?: Partial<AntigravityRunnerConfig>) {
    super()
    this.#config = {
      timeoutMs: config?.timeoutMs ?? 0,
      agyBin: config?.agyBin ?? 'agy',
      model: config?.model ?? 'gemini-3.5-flash',
    }
  }

  protected get binaryName(): string {
    return this.#config.agyBin
  }

  protected get timeoutMs(): number {
    return this.#config.timeoutMs
  }

  protected get writePromptToStdin(): boolean {
    return true
  }

  protected getModelName(_invocation: AgentInvocation): string | undefined {
    return this.#config.model
  }

  protected buildArgs(prompt: string, _invocation: AgentInvocation): string[] {
    const args = ['--prompt', prompt]
    if (this.#config.model) {
      args.push('--model', this.#config.model)
    }
    return args
  }
}

AgentRunnerRegistry.register({
  type: 'antigravity',
  constructor: AntigravityRunner,
})
