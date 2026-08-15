import { AbstractCliRunner } from '../AbstractCliRunner'
import { Runner, type AgentInvocation, type AgentOutput } from '../types'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { defaultProgress, extractJsonOrNull } from '../CliRunnerProgress'

export class CodexCLIRunner extends AbstractCliRunner {
  readonly type = Runner.CODEX_CLI

  protected get binaryName(): string {
    return 'codex'
  }

  protected override get writePromptToStdin(): boolean {
    return true
  }

  protected buildArgs(_prompt: string, invocation: AgentInvocation): string[] {
    const args = [
      'exec',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
    ]

    const model = this.getModelName(invocation)
    if (model) args.push('--model', model)

    const effort = this.getEffort(invocation)
    if (effort) {
      args.push('--config', `model_reasoning_effort="${effort}"`)
    }

    if (invocation.workspacePath) {
      args.push('--cd', invocation.workspacePath)
    }

    for (const dir of invocation.additionalDirs ?? []) {
      args.push('--add-dir', dir)
    }

    if (invocation.session?.id) {
      args.push('resume', invocation.session.id)
    }

    return args
  }

  protected override onStdoutLine(line: string, invocation: AgentInvocation): void {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }

    const type = event.type as string | undefined

    if (type === 'item.completed' || type === 'item.started') {
      const item = event.item as Record<string, unknown> | undefined
      if (!item) return

      if (item.type === 'agent_message' && typeof item.text === 'string') {
        defaultProgress({
          agent: invocation.agent,
          skill: invocation.skill ?? '',
          type: 'text',
          text: item.text,
        })
      } else if (item.type === 'tool_use' || item.type === 'function_call') {
        defaultProgress({
          agent: invocation.agent,
          skill: invocation.skill ?? '',
          type: 'tool_use',
          toolName: typeof item.name === 'string' ? item.name : undefined,
        })
      }
    } else if (type === 'assistant' || type === 'text') {
      const text = typeof event.text === 'string' ? event.text : undefined
      if (text) {
        defaultProgress({
          agent: invocation.agent,
          skill: invocation.skill ?? '',
          type: 'text',
          text,
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
        skill: invocation.skill ?? '',
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
    let sessionId: string | undefined = invocation.session?.id

    const lines = stdout.split('\n').filter(Boolean)

    for (const raw of lines) {
      let event: Record<string, unknown>
      try {
        event = JSON.parse(raw) as Record<string, unknown>
      } catch {
        continue
      }

      if (typeof event.session_id === 'string') sessionId = event.session_id
      else if (typeof event.sessionId === 'string') sessionId = event.sessionId
      else if (typeof event.thread_id === 'string') sessionId = event.thread_id
      else if (typeof event.conversation_id === 'string') sessionId = event.conversation_id

      const type = event.type as string | undefined

      if (type === 'error') {
        isFinalError = true
      }

      if (type === 'item.completed') {
        const item = event.item as Record<string, unknown> | undefined
        if (item) {
          if (item.type === 'error') {
            isFinalError = true
          }
          if (item.type === 'agent_message' && typeof item.text === 'string') {
            finalResult = item.text
          } else if (typeof item.text === 'string') {
            finalResult = item.text
          }
        }
      }

      if (type === 'result' || type === 'turn.completed') {
        if (event.is_error === true || event.subtype === 'error') {
          isFinalError = true
        }
        if (typeof event.result === 'string') {
          finalResult = event.result
        }

        const u = (event.usage ?? (event.item as Record<string, unknown>)?.usage) as Record<string, number> | undefined
        const totalCostUsd = typeof event.total_cost_usd === 'number'
          ? event.total_cost_usd
          : typeof event.cost_usd === 'number'
            ? event.cost_usd
            : 0

        if (u) {
          finalUsage = {
            inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
            outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
            cacheCreationTokens: u.cache_write_input_tokens ?? u.cache_creation_input_tokens ?? u.cacheCreationTokens ?? 0,
            cacheReadTokens: u.cached_input_tokens ?? u.cache_read_input_tokens ?? u.cacheReadTokens ?? 0,
            costUsd: totalCostUsd,
            model: this.getModelName(invocation) ?? 'default',
            effort: this.getEffort(invocation) ?? '',
          }
        }
      }
    }

    const outputText = finalResult || stdout

    return {
      success: !isFinalError,
      stdout: outputText,
      stderr,
      raw: outputText,
      usage: finalUsage,
      session: sessionId ? { id: sessionId } : undefined,
      artefacts: (() => {
        const j = extractJsonOrNull(outputText)
        if (j && typeof j === 'object' && !Array.isArray(j)) {
          return j as Record<string, string>
        }
        return undefined
      })(),
    }
  }
}

AgentRunnerRegistry.register({
  type: Runner.CODEX_CLI,
  constructor: CodexCLIRunner,
})
