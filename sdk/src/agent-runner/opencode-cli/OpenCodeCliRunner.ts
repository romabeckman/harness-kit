import { AbstractCliRunner } from '../AbstractCliRunner'
import { Runner, type AgentInvocation, type AgentOutput } from '../types'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { defaultProgress, extractJsonOrNull } from '../CliRunnerProgress'

export class OpenCodeCLIRunner extends AbstractCliRunner {
  readonly type = Runner.OPENCODE_CLI

  protected override get nonZeroExitErrorCode(): AgentRunnerErrorCode {
    return AgentRunnerErrorCode.API_ERROR
  }

  protected get binaryName(): string {
    return 'opencode'
  }

  protected override get writePromptToStdin(): boolean {
    return true
  }

  protected buildArgs(_prompt: string, invocation: AgentInvocation): string[] {
    const args: string[] = ['run', '--format', 'json']

    const model = this.getModelName(invocation)
    if (model && !model.includes('/')) {
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.API_ERROR,
        skill: invocation.skill ?? '',
        phase: 'dispatch',
        message: 'OpenCode model must use provider/model format; run opencode models to list valid identifiers.',
      })
    }
    if (model) args.push('--model', model)

    const effort = this.getEffort(invocation)
    if (effort) args.push('--variant', effort)

    if (invocation.agent) args.push('--agent', invocation.agent)
    if (invocation.session?.id) args.push('--session', invocation.session.id)
    if (invocation.workspacePath) args.push('--dir', invocation.workspacePath)

    // OpenCode 1.18.21 has no CLI equivalent for additional directory grants.
    // The child process still runs from workspacePath via AbstractCliRunner.

    return args
  }

  protected override onStdoutLine(line: string, invocation: AgentInvocation): void {
    let event: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(line)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
      event = parsed as Record<string, unknown>
    } catch {
      return
    }

    const type = event.type as string | undefined

    if (type === 'assistant') {
      const message = event.message as Record<string, unknown> | undefined
      const content = message?.content as Array<Record<string, unknown>> | undefined
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            defaultProgress({
              agent: invocation.agent,
              skill: invocation.skill ?? '',
              type: 'text',
              text: block.text,
            })
          } else if (block.type === 'tool_use') {
            defaultProgress({
              agent: invocation.agent,
              skill: invocation.skill ?? '',
              type: 'tool_use',
              toolName: typeof block.name === 'string' ? block.name : undefined,
            })
          }
        }
      }
    } else if (type === 'item.completed' || type === 'item.started') {
      const item = event.item as Record<string, unknown> | undefined
      if (item) {
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
      }
    } else if (type === 'text') {
      const text = typeof event.text === 'string' ? event.text : undefined
      if (text) {
        defaultProgress({
          agent: invocation.agent,
          skill: invocation.skill ?? '',
          type: 'text',
          text,
        })
      }
    } else if (type === 'tool_use' || type === 'tool' || type === 'function_call') {
      const toolName = typeof event.toolName === 'string'
        ? event.toolName
        : (typeof event.name === 'string' ? event.name : undefined)
      defaultProgress({
        agent: invocation.agent,
        skill: invocation.skill ?? '',
        type: 'tool_use',
        toolName,
      })
    }
  }

  protected override checkParsed(
    parsed: Partial<AgentOutput> & { errorDetail?: string },
    invocation: AgentInvocation,
  ): AgentRunnerError | null {
    if (parsed.success === false) {
      const errorMsg = parsed.errorDetail || parsed.raw || ''
      return new AgentRunnerError({
        code: AgentRunnerErrorCode.API_ERROR,
        skill: invocation.skill ?? '',
        phase: 'dispatch',
        message: `${this.binaryName} agent returned an error${errorMsg ? `: ${errorMsg}` : ''}`,
      })
    }
    return null
  }

  protected override parseOutput(
    stdout: string,
    stderr: string,
    invocation: AgentInvocation,
  ): Partial<AgentOutput> {
    const cleanStdout = stdout.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '').trim()

    let parsedJson: Record<string, any> | null = null
    try {
      parsedJson = JSON.parse(cleanStdout)
    } catch {
      parsedJson = null
    }

    let sessionId: string | undefined = invocation.session?.id

    if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
      if (typeof parsedJson.conversation_id === 'string') sessionId = parsedJson.conversation_id
      else if (typeof parsedJson.conversationId === 'string') sessionId = parsedJson.conversationId
      else if (typeof parsedJson.session_id === 'string') sessionId = parsedJson.session_id
      else if (typeof parsedJson.sessionId === 'string') sessionId = parsedJson.sessionId

      const status = parsedJson.status
      const hasResponse = typeof parsedJson.response === 'string' && parsedJson.response.trim().length > 0
      const isError = status === 'FAILED'
        || (status === 'ERROR' && !hasResponse)
        || parsedJson.is_error === true
        || parsedJson.subtype === 'error'
        || parsedJson.type === 'error'

      const rawResponse = typeof parsedJson.response === 'string'
        ? parsedJson.response
        : (typeof parsedJson.result === 'string'
            ? parsedJson.result
            : (typeof parsedJson.text === 'string' ? parsedJson.text : cleanStdout))

      const errorDetail = typeof parsedJson.error === 'string'
        ? parsedJson.error
        : (typeof parsedJson.error_message === 'string'
            ? parsedJson.error_message
            : (typeof parsedJson.message === 'string'
                ? parsedJson.message
                : (isError && typeof parsedJson.result === 'string'
                    ? parsedJson.result
                    : (isError && typeof parsedJson.text === 'string' ? parsedJson.text : undefined))))

      const artefacts = (parsedJson.structured_output && typeof parsedJson.structured_output === 'object' && !Array.isArray(parsedJson.structured_output))
        ? parsedJson.structured_output
        : (() => {
            const j = extractJsonOrNull(rawResponse)
            if (j && typeof j === 'object' && !Array.isArray(j)) {
              return j as Record<string, string>
            }
            return undefined
          })()

      const usageData = parsedJson.usage
      const totalCostUsd = typeof parsedJson.total_cost_usd === 'number'
        ? parsedJson.total_cost_usd
        : (typeof parsedJson.cost_usd === 'number'
            ? parsedJson.cost_usd
            : (typeof usageData?.cost_usd === 'number'
                ? usageData.cost_usd
                : (typeof usageData?.total_cost_usd === 'number'
                    ? usageData.total_cost_usd
                    : (typeof usageData?.costUsd === 'number' ? usageData.costUsd : 0))))

      const modelUsage = parsedJson.modelUsage as Record<string, unknown> | undefined
      const detectedModel = modelUsage
        ? Object.keys(modelUsage)[0]
        : (typeof parsedJson.model === 'string' ? parsedJson.model : (this.getModelName(invocation) ?? 'default'))

      const finalUsage = (usageData || totalCostUsd > 0 || modelUsage)
        ? {
            inputTokens: usageData?.input_tokens ?? usageData?.inputTokens ?? 0,
            outputTokens: usageData?.output_tokens ?? usageData?.outputTokens ?? 0,
            cacheCreationTokens: usageData?.cache_creation_tokens ?? usageData?.cache_creation_input_tokens ?? usageData?.cacheCreationTokens ?? 0,
            cacheReadTokens: usageData?.cache_read_tokens ?? usageData?.cache_read_input_tokens ?? usageData?.cacheReadTokens ?? 0,
            costUsd: totalCostUsd,
            model: detectedModel,
            effort: this.getEffort(invocation) ?? '',
          }
        : undefined

      return {
        success: !isError,
        stdout: rawResponse,
        stderr,
        raw: rawResponse,
        session: sessionId ? { id: sessionId } : undefined,
        artefacts,
        usage: finalUsage,
        ...(errorDetail ? { errorDetail } : {}),
      }
    }

    // Stream lines parsing
    let finalUsage: AgentOutput['usage'] | undefined
    let finalResult = ''
    let isFinalError = false
    let streamErrorDetail: string | undefined

    const lines = stdout.split('\n').filter(Boolean)

    for (const raw of lines) {
      let event: Record<string, unknown>
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
        event = parsed as Record<string, unknown>
      } catch {
        continue
      }

      if (typeof event.session_id === 'string') sessionId = event.session_id
      else if (typeof event.sessionId === 'string') sessionId = event.sessionId
      else if (typeof event.thread_id === 'string') sessionId = event.thread_id
      else if (typeof event.conversation_id === 'string') sessionId = event.conversation_id

      const type = event.type as string | undefined

      if (type === 'error' || event.is_error === true || event.subtype === 'error' || event.status === 'FAILED') {
        isFinalError = true
        if (typeof event.error === 'string') streamErrorDetail = event.error
        else if (typeof event.result === 'string') streamErrorDetail = event.result
        else if (typeof event.message === 'string') streamErrorDetail = event.message
      }

      if (type === 'item.completed') {
        const item = event.item as Record<string, unknown> | undefined
        if (item) {
          if (item.type === 'error') isFinalError = true
          if (typeof item.text === 'string') finalResult = item.text
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
          const modelUsage = event.modelUsage as Record<string, unknown> | undefined
          const detectedModel = modelUsage ? Object.keys(modelUsage)[0] : (this.getModelName(invocation) ?? 'default')

          finalUsage = {
            inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
            outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
            cacheCreationTokens: u.cache_creation_input_tokens ?? u.cache_creation_tokens ?? u.cacheCreationTokens ?? 0,
            cacheReadTokens: u.cache_read_input_tokens ?? u.cache_read_tokens ?? u.cacheReadTokens ?? 0,
            costUsd: totalCostUsd,
            model: detectedModel,
            effort: this.getEffort(invocation) ?? '',
          }
        }
      }
    }

    const outputText = (finalResult || cleanStdout).trim()

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
      ...(streamErrorDetail ? { errorDetail: streamErrorDetail } : {}),
    }
  }
}

AgentRunnerRegistry.register({
  type: Runner.OPENCODE_CLI,
  constructor: OpenCodeCLIRunner,
})
