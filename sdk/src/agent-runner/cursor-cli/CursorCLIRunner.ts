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
      cursorBin: config?.cursorBin ?? 'agent',
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
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--stream-partial-output',
      '--force',
      '--trust',
    ]

    const model = invocation.model ?? (this.#config.model || undefined)
    if (model) args.push('--model', model)

    if (invocation.workspacePath) args.push('--workspace', invocation.workspacePath)
    for (const dir of invocation.additionalDirs ?? []) args.push('--add-dir', dir)

    args.push('--', prompt)
    return args
  }

  protected parseOutput(
    stdout: string,
    stderr: string,
    invocation: AgentInvocation,
  ): Partial<AgentOutput> {
    const lines = stdout.split('\n').filter(Boolean)
    let raw = ''
    let finalResult: string | undefined

    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        if (obj.type === 'text' && typeof obj.text === 'string') {
          raw += obj.text
        } else if (obj.type === 'result' && typeof obj.result === 'string') {
          finalResult = obj.result
        }
      } catch {
        // ignore non-json lines
      }
    }

    return { raw: finalResult ?? (raw || stdout) }
  }
}

AgentRunnerRegistry.register({
  type: 'cursor-cli',
  constructor: CursorCLIRunner,
})
