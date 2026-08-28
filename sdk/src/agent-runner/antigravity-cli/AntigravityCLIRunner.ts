import { AbstractCliRunner } from '../AbstractCliRunner'
import { Runner, type AgentInvocation, type AgentOutput } from '../types'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../settings/DefaultSettings'
import { extractJsonOrNull } from '../CliRunnerProgress'

export class AntigravityCLIRunner extends AbstractCliRunner {
  readonly type = Runner.ANTIGRAVITY_CLI

  protected get binaryName(): string {
    return 'agy'
  }

  override get writePromptToStdin(): boolean {
    return true
  }

  protected buildArgs(_prompt: string, invocation: AgentInvocation): string[] {
    const args: string[] = []
    const timeout = invocation.timeoutMs ?? DEFAULT_PHASE_TIMEOUT_MS

    for (const dir of invocation.additionalDirs ?? []) args.push('--add-dir', dir)

    const model = this.getModelName(invocation)
    if (model) args.push('--model', model)
    const effort = this.getEffort(invocation)
    if (effort) args.push('--effort', effort)

    args.push('--output-format', 'json')

    // add 1000ms to timeout to avoid throw error for 1sec difference
    args.push('--print-timeout', `${timeout + 1000}ms`)
    args.push('--dangerously-skip-permissions')
    if (invocation.agent) args.push('--agent', invocation.agent)
    if (invocation.session?.id) args.push('--conversation', invocation.session.id)
    return args
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
        message: `${this.binaryName} agent returned an error: ${errorMsg}`,
      })
    }
    return null
  }

  protected override parseOutput(
    stdout: string,
    stderr: string,
    invocation: AgentInvocation,
  ): Partial<AgentOutput> {
    let parsedJson: Record<string, any> | null = null;
    try {
      parsedJson = JSON.parse(stdout.trim())
    } catch {
      parsedJson = null
    }

    let sessionId: string | undefined = invocation.session?.id
    if (parsedJson) {
      if (typeof parsedJson.conversation_id === 'string') sessionId = parsedJson.conversation_id
      else if (typeof parsedJson.conversationId === 'string') sessionId = parsedJson.conversationId
      else if (typeof parsedJson.session_id === 'string') sessionId = parsedJson.session_id
      else if (typeof parsedJson.sessionId === 'string') sessionId = parsedJson.sessionId
    }

    if (!parsedJson || typeof parsedJson !== 'object') {
      return {
        success: true,
        stdout,
        stderr,
        raw: stdout,
        session: sessionId ? { id: sessionId } : undefined,
        artefacts: (() => {
          const j = extractJsonOrNull(stdout)
          if (j && typeof j === 'object' && !Array.isArray(j)) {
            return j as Record<string, string>
          }
          return undefined
        })(),
      }
    }

    const status = parsedJson.status
    const errorDetail = typeof parsedJson.error === 'string'
      ? parsedJson.error
      : (typeof parsedJson.error_message === 'string'
          ? parsedJson.error_message
          : (typeof parsedJson.message === 'string' ? parsedJson.message : undefined))

    const hasResponse = typeof parsedJson.response === 'string' && parsedJson.response.trim().length > 0
    const rawResponse = typeof parsedJson.response === 'string' ? parsedJson.response : stdout

    // If status is FAILED, or status is ERROR and there is no valid response content, treat as error.
    // If status is ERROR but response has valid content, the turn completed (e.g. tool warning recovery).
    const isError = status === 'FAILED' || (status === 'ERROR' && !hasResponse)

    const artefacts = parsedJson.structured_output ?? (() => {
      const j = extractJsonOrNull(rawResponse)
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        return j as Record<string, string>
      }
      return undefined
    })()

    const usageData = parsedJson.usage
    const finalUsage = usageData
      ? {
          inputTokens: usageData.input_tokens ?? 0,
          outputTokens: usageData.output_tokens ?? 0,
          cacheCreationTokens: usageData.cache_creation_tokens ?? 0,
          cacheReadTokens: usageData.cache_read_tokens ?? 0,
          costUsd: usageData.cost_usd ?? 0,
          model: this.getModelName(invocation),
          effort: this.getEffort(invocation),
        }
      : undefined

    return {
      success: !isError,
      stdout: rawResponse,
      stderr,
      raw: rawResponse,
      artefacts,
      usage: finalUsage,
      session: sessionId ? { id: sessionId } : undefined,
      ...(errorDetail ? { errorDetail } : {}),
    } as Partial<AgentOutput>
  }
}

AgentRunnerRegistry.register({
  type: Runner.ANTIGRAVITY_CLI,
  constructor: AntigravityCLIRunner,
})
