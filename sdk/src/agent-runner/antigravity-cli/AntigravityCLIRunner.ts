import { AbstractCliRunner } from '../AbstractCliRunner'
import type { AgentInvocation } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../settings/DefaultSettings'

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
      timeoutMs: config?.timeoutMs ?? DEFAULT_PHASE_TIMEOUT_MS,
      agyBin: config?.agyBin ?? 'agy',
      model: config?.model ?? 'gemini-3.5-flash',
    }
    this.timeoutMs = this.#config.timeoutMs
  }

  protected get binaryName(): string {
    return this.#config.agyBin
  }

  protected get writePromptToStdin(): boolean {
    return true
  }

  protected getModelName(invocation: AgentInvocation): string | undefined {
    return invocation.model ?? this.#config.model
  }

  protected buildArgs(prompt: string, invocation: AgentInvocation): string[] {
    const DEFAULT_TIMEOUT = '60m'
    const args = ['--print', prompt]
    const model = invocation.model ?? this.#config.model
    if (model) {
      args.push('--model', model)
    }

    // add 1000ms to timeout to avoid throw error for 1sec difference
    const timeout = this.timeoutMs > 0 ? `${this.timeoutMs + 1000}ms` : DEFAULT_TIMEOUT + 1000
    args.push('--print-timeout', timeout)
    return args
  }
}

AgentRunnerRegistry.register({
  type: 'antigravity-cli',
  constructor: AntigravityCLIRunner,
})
