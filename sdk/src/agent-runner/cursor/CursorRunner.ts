import type { AgentInvocation } from '../types'
import { AbstractCliRunner } from '../AbstractCliRunner'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'

export interface CursorRunnerConfig {
  readonly cursorBin?: string
  readonly outputFormat?: 'text' | 'json'
  readonly timeoutMs?: number
}

export class CursorRunner extends AbstractCliRunner {
  readonly #cursorBin: string
  readonly #outputFormat: 'text' | 'json'
  readonly timeoutMs: number

  constructor(config?: Partial<CursorRunnerConfig>) {
    super()
    this.#cursorBin = config?.cursorBin ?? 'cursor-agent'
    this.#outputFormat = config?.outputFormat ?? 'json'
    this.timeoutMs = config?.timeoutMs ?? 0
  }

  protected get binaryName(): string {
    return this.#cursorBin
  }

  protected buildArgs(prompt: string, _invocation: AgentInvocation): string[] {
    return [
      prompt,
      '--print',
      '--force',
      '--approve-mcps',
      '--output-format',
      this.#outputFormat,
    ]
  }
}

AgentRunnerRegistry.register({
  type: 'cursor',
  constructor: CursorRunner,
  validateConfig: () => {
    if (!process.env.CURSOR_API_KEY) {
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.MISSING_API_KEY,
        skill: 'unknown',
        phase: 'validate',
        message: 'CursorRunner requires CURSOR_API_KEY environment variable to be set',
      })
    }
  },
})
