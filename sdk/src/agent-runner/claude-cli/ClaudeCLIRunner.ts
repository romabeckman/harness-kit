import type { AgentInvocation, AgentOutput } from '../types'
import { AbstractCliRunner } from '../AbstractCliRunner'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { type ProgressLine, defaultProgress, extractJsonOrNull } from '../CliRunnerProgress'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../settings/DefaultSettings'
export type { ProgressLine } from '../CliRunnerProgress'

export interface ClaudeCLIRunnerConfig {
  readonly timeoutMs: number
  readonly claudeBin: string
  readonly model?: string
  readonly effort?: string
  readonly onProgress?: (line: ProgressLine) => void
}

export class ClaudeCLIRunner extends AbstractCliRunner {
  readonly type = 'claude-cli'
  readonly #config: ClaudeCLIRunnerConfig & { onProgress: (line: ProgressLine) => void }

  constructor(config?: Partial<ClaudeCLIRunnerConfig>) {
    super()
    this.#config = {
      model: config?.model,
      effort: config?.effort,
      claudeBin: config?.claudeBin ?? 'claude',
      timeoutMs: config?.timeoutMs ?? DEFAULT_PHASE_TIMEOUT_MS,
      onProgress: defaultProgress,
      ...config,
    }
    this.timeoutMs = this.#config.timeoutMs
  }

  protected get binaryName(): string {
    return this.#config.claudeBin
  }

  protected override get writePromptToStdin(): boolean {
    return true
  }

  protected buildArgs(_prompt: string, invocation: AgentInvocation): string[] {
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--input-format', 'text',
      '--dangerously-skip-permissions',
    ]

    const model = invocation.model ?? this.#config.model
    const effort = invocation.effort ?? this.#config.effort
    if (model) args.push('--model', model)
    if (effort) args.push('--effort', effort)
    if (invocation.agent) args.push('--agent', invocation.agent)
    for (const dir of invocation.additionalDirs ?? []) args.push('--add-dir', dir)

    return args
  }

  protected override onStdoutLine(line: string, invocation: AgentInvocation): void {
    let event: Record<string, unknown>
    try { event = JSON.parse(line) as Record<string, unknown> }
    catch { return }

    if (event.type !== 'assistant') return

    const message = event.message as Record<string, unknown> | undefined
    const content = message?.content as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(content)) return

    for (const block of content) {
      if (block.type === 'text') {
        this.#config.onProgress({
          agent: invocation.agent,
          skill: invocation.skill ?? 'unknown',
          type: 'text',
          text: typeof block.text === 'string' ? block.text : undefined,
        })
      } else if (block.type === 'tool_use') {
        this.#config.onProgress({
          agent: invocation.agent,
          skill: invocation.skill ?? 'unknown',
          type: 'tool_use',
          toolName: typeof block.name === 'string' ? block.name : undefined,
        })
      }
    }
  }

  protected override checkParsed(
    parsed: Partial<AgentOutput>,
    invocation: AgentInvocation,
  ): AgentRunnerError | null {
    if (parsed.success === false) {
      return new AgentRunnerError({
        code: AgentRunnerErrorCode.API_ERROR,
        skill: invocation.skill ?? 'unknown',
        phase: 'dispatch',
        message: `${this.binaryName} agent returned an error: ${parsed.raw ?? ''}`,
      })
    }
    return null
  }

  protected parseOutput(
    stdout: string,
    stderr: string,
    invocation: AgentInvocation,
  ): Partial<AgentOutput> {
    let finalUsage: AgentOutput['usage'] | undefined
    let finalResult = ''
    let isFinalError = false

    const lines = stdout.split('\n').filter(Boolean)

    for (const raw of lines) {
      let event: Record<string, unknown>
      try { event = JSON.parse(raw) as Record<string, unknown> }
      catch { continue }

      const type = event.type as string

      if (type === 'result') {
        const subtype = event.subtype as string
        isFinalError = event.is_error === true || subtype === 'error'
        finalResult = typeof event.result === 'string' ? event.result : ''

        const u = event.usage as Record<string, number> | undefined
        if (u) {
          const modelUsage = event.modelUsage as Record<string, unknown> | undefined
          const detectedModel = modelUsage ? Object.keys(modelUsage)[0] : (invocation.model ?? this.#config.model)

          finalUsage = {
            inputTokens: u.input_tokens ?? 0,
            outputTokens: u.output_tokens ?? 0,
            cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
            cacheReadTokens: u.cache_read_input_tokens ?? 0,
            costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : 0,
            model: detectedModel,
            effort: invocation.effort ?? this.#config.effort,
          }
        }
      }
    }

    return {
      success: !isFinalError,
      stdout: finalResult,
      stderr: stderr,
      raw: finalResult,
      usage: finalUsage,
      artefacts: (() => {
        const j = extractJsonOrNull(finalResult)
        if (j && typeof j === 'object' && !Array.isArray(j)) {
          return j as Record<string, string>
        }
        return undefined
      })(),
    }
  }
}

AgentRunnerRegistry.register({
  type: 'claude-cli',
  constructor: ClaudeCLIRunner,
})
