import { AbstractCliRunner } from '../AbstractCliRunner'
import type { AgentInvocation, AgentOutput } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'

export interface CursorCLIRunnerConfig {
  readonly timeoutMs?: number
  readonly cursorBin?: string
  readonly model?: string
}

export class CursorCLIRunner extends AbstractCliRunner {
  readonly type = 'cursor-cli'
  readonly #config: Required<CursorCLIRunnerConfig>

  constructor(config?: Partial<CursorCLIRunnerConfig>) {
    super()
    this.#config = {
      timeoutMs: config?.timeoutMs ?? 0,
      cursorBin: config?.cursorBin ?? 'cursor',
      model: config?.model ?? '',
    }
  }

  protected get binaryName(): string {
    return this.#config.cursorBin
  }

  protected get timeoutMs(): number {
    return this.#config.timeoutMs
  }

  protected getModelName(invocation: AgentInvocation): string | undefined {
    return invocation.model ?? (this.#config.model || undefined)
  }

  protected buildArgs(prompt: string, invocation: AgentInvocation): string[] {
    const args = ['agent', '--print', '--output-format', 'stream-json', '--force']

    const model = invocation.model ?? (this.#config.model || undefined)
    if (model) args.push('--model', model)

    if (invocation.workspacePath) args.push('--workspace', invocation.workspacePath)
    for (const dir of invocation.additionalDirs ?? []) args.push('--add-dir', dir)

    args.push(prompt)
    return args
  }

  protected parseOutput(
    stdout: string,
    stderr: string,
    invocation: AgentInvocation,
  ): Partial<AgentOutput> {
    const lines = stdout.split('\n').filter(Boolean)
    let raw = stdout

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]) as Record<string, unknown>
        if (obj.type === 'result' && typeof obj.result === 'string') {
          raw = obj.result
          break
        }
        if (obj.type === 'text' && typeof obj.text === 'string') {
          raw = obj.text
          break
        }
      } catch {
        // not JSON, keep scanning
      }
    }

    return { raw }
  }
}

AgentRunnerRegistry.register({
  type: 'cursor-cli',
  constructor: CursorCLIRunner,
})
