import { AbstractCliRunner } from '../AbstractCliRunner'
import type { AgentInvocation } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'

export interface AntigravityCLIRunnerConfig {
  readonly timeoutMs?: number
  readonly agyBin?: string
  readonly model?: string
}

export class AntigravityCLIRunner extends AbstractCliRunner {
  readonly type = 'antigravity-cli'
  readonly #config: Required<AntigravityCLIRunnerConfig>

  constructor(config?: Partial<AntigravityCLIRunnerConfig>) {
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

  protected getModelName(invocation: AgentInvocation): string | undefined {
    return invocation.model ?? this.#config.model
  }

  protected buildArgs(prompt: string, invocation: AgentInvocation): string[] {
    const args = ['--prompt', prompt]
    const model = invocation.model ?? this.#config.model
    if (model) {
      args.push('--model', model)
    }
    return args
  }
}

AgentRunnerRegistry.register({
  type: 'antigravity-cli',
  constructor: AntigravityCLIRunner,
})
