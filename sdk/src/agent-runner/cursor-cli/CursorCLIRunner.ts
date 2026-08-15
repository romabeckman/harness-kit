import { AbstractCliRunner } from '../AbstractCliRunner'
import { Runner, type AgentInvocation, type AgentOutput } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { defaultProgress, extractJsonOrNull } from '../CliRunnerProgress'

export class CursorCLIRunner extends AbstractCliRunner {
  readonly type = Runner.CURSOR_CLI

  protected get binaryName(): string {
    return 'agent'
  }

  protected override get writePromptToStdin(): boolean {
    return true
  }

  protected buildArgs(_prompt: string, invocation: AgentInvocation): string[] {
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--stream-partial-output',
      '--force',
      '--trust',
      '--approve-mcps',
    ]

    let model = this.getModelName(invocation)
    const effort = this.getEffort(invocation)

    if (model) {
      if (effort && !model.includes('[')) {
        model = `${model}[effort=${effort}]`
      }
      args.push('--model', model)
    }
    if (invocation.workspacePath) args.push('--workspace', invocation.workspacePath)
    for (const dir of invocation.additionalDirs ?? []) args.push('--add-dir', dir)
    if (invocation.session?.id) args.push('--resume', invocation.session.id)
    return args
  }

  protected override onStdoutLine(line: string, invocation: AgentInvocation): void {
    let event: Record<string, unknown>
    try { event = JSON.parse(line) as Record<string, unknown> }
    catch { return }

    if (event.type === 'thinking' && event.subtype === 'delta') {
      const text = event.text
      if (typeof text === 'string') {
        defaultProgress({
          agent: invocation.agent ?? 'cursor-cli',
          skill: invocation.skill ?? '',
          type: 'text',
          text: text,
        })
      }
      return
    }

    if (event.type !== 'assistant') return

    // Streaming chunks have timestamp_ms and session_id. Finalized messages do not have timestamp_ms.
    if (typeof event.timestamp_ms !== 'number' || !event.session_id) return

    const message = event.message as Record<string, unknown> | undefined
    const content = message?.content as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(content)) return

    for (const block of content) {
      if (block.type === 'text') {
        defaultProgress({
          agent: invocation.agent ?? 'cursor-cli',
          skill: invocation.skill ?? '',
          type: 'text',
          text: typeof block.text === 'string' ? block.text : undefined,
        })
      } else if (block.type === 'tool_use') {
        defaultProgress({
          agent: invocation.agent ?? 'cursor-cli',
          skill: invocation.skill ?? '',
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

    for (const line of lines) {
      let event: Record<string, unknown>
      try { event = JSON.parse(line) as Record<string, unknown> }
      catch { continue }

      if (typeof event.session_id === 'string') sessionId = event.session_id
      else if (typeof event.sessionId === 'string') sessionId = event.sessionId

      const type = event.type as string

      if (type === 'result') {
        const subtype = event.subtype as string
        isFinalError = event.is_error === true || subtype === 'error'
        finalResult = typeof event.result === 'string' ? event.result : ''

        const u = event.usage as Record<string, number> | undefined
        if (u) {
          finalUsage = {
            inputTokens: u.inputTokens ?? 0,
            outputTokens: u.outputTokens ?? 0,
            cacheCreationTokens: u.cacheWriteTokens ?? 0,
            cacheReadTokens: u.cacheReadTokens ?? 0,
            costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : 0,
            model: this.getModelName(invocation) ?? 'default',
            effort: this.getEffort(invocation) ?? '',
          }
        }
      }
    }

    return {
      success: !isFinalError,
      stdout: finalResult || stdout,
      stderr: stderr,
      raw: finalResult || stdout,
      usage: finalUsage,
      session: sessionId ? { id: sessionId } : undefined,
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
  type: Runner.CURSOR_CLI,
  constructor: CursorCLIRunner,
})

