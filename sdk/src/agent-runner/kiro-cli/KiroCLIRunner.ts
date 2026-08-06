import { Runner, type AgentInvocation, type AgentOutput } from '../types'
import { AbstractCliRunner } from '../AbstractCliRunner'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { defaultProgress, extractJsonOrNull } from '../CliRunnerProgress'

export class KiroCLIRunner extends AbstractCliRunner {
  readonly type = Runner.KIRO_CLI

  protected get binaryName(): string {
    return 'kiro-cli'
  }

  protected override get writePromptToStdin(): boolean {
    return true
  }

  protected buildArgs(_prompt: string, invocation: AgentInvocation): string[] {
    const args = ['chat', '--no-interactive', '--trust-all-tools']

    const model = this.getModelName(invocation)
    if (model) args.push('--model', model)
    const effort = this.getEffort(invocation)
    if (effort) args.push('--effort', effort)
    if (invocation.agent) args.push('--agent', invocation.agent)

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
        defaultProgress({
          agent: invocation.agent,
          skill: invocation.skill ?? '',
          type: 'text',
          text: typeof block.text === 'string' ? block.text : undefined,
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
          const detectedModel = modelUsage ? Object.keys(modelUsage)[0] : (invocation.model ?? 'default')

          finalUsage = {
            inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
            outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
            cacheCreationTokens: u.cache_creation_input_tokens ?? u.cacheWriteTokens ?? 0,
            cacheReadTokens: u.cache_read_input_tokens ?? u.cacheReadTokens ?? 0,
            costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : 0,
            model: detectedModel,
            effort: this.getEffort(invocation) ?? '',
          }
        }
      }
    }

    const cleanStdout = stdout.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    const outputText = (finalResult || cleanStdout).trim()

    return {
      success: !isFinalError,
      stdout: outputText,
      stderr: stderr,
      raw: outputText,
      usage: finalUsage,
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
  type: Runner.KIRO_CLI,
  constructor: KiroCLIRunner,
})
