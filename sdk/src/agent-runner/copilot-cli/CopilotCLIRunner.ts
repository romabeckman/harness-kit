import { AbstractCliRunner } from '../AbstractCliRunner'
import { Runner, type AgentInvocation, type AgentOutput } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { defaultProgress, extractJsonOrNull } from '../CliRunnerProgress'

export class CopilotCLIRunner extends AbstractCliRunner {
  readonly type = Runner.COPILOT_CLI

  protected get binaryName(): string {
    return 'copilot'
  }

  protected get writePromptToStdin(): boolean {
    return false
  }

  protected buildArgs(prompt: string, invocation: AgentInvocation): string[] {
    const args = ['--allow-all', '--autopilot', '--output-format', 'json']

    const model = this.getModelName(invocation)
    if (model) args.push('--model', model)
    const effort = this.getEffort(invocation)
    if (effort) args.push('--reasoning-effort', effort)
    if (invocation.agent) args.push('--agent', invocation.agent)
    for (const dir of invocation.additionalDirs ?? []) args.push('--add-dir', dir)
    if (invocation.session?.id) args.push('--resume', invocation.session.id)

    args.push('--prompt', prompt)
    return args
  }

  protected override onStdoutLine(line: string, invocation: AgentInvocation): void {
    let event: Record<string, unknown>
    try { event = JSON.parse(line) as Record<string, unknown> }
    catch { return }

    if (event.type === 'assistant.message') {
      const data = event.data as Record<string, unknown> | undefined
      const content = data?.content as string | undefined
      if (typeof content === 'string') {
        defaultProgress({
          agent: invocation.agent ?? '',
          skill: invocation.skill ?? '',
          type: 'text',
          text: content,
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
        message: `${this.binaryName} agent returned an error: ${parsed.raw ?? ''}`
      })
    }
    return null
  }

  protected override parseOutput(
    stdout: string,
    stderr: string,
    invocation: AgentInvocation,
  ): Partial<AgentOutput> {
    let finalContent = ''
    let outputTokens: number | undefined
    let isSuccess = true
    let sessionId: string | undefined = invocation.session?.id

    const lines = stdout.split('\n').filter(Boolean)

    for (const line of lines) {
      let event: Record<string, unknown>
      try { event = JSON.parse(line) as Record<string, unknown> }
      catch { continue }

      if (typeof event.session_id === 'string') sessionId = event.session_id
      else if (typeof event.sessionId === 'string') sessionId = event.sessionId
      else if (typeof event.conversation_id === 'string') sessionId = event.conversation_id

      const type = event.type as string

      if (type === 'assistant.message') {
        const data = event.data as Record<string, unknown> | undefined
        const content = data?.content as string | undefined
        if (typeof content === 'string') {
          finalContent = content
        }
        if (typeof data?.outputTokens === 'number') {
          outputTokens = data.outputTokens
        }
      } else if (type === 'result') {
        isSuccess = (event.exitCode as number) === 0
      }
    }

    return {
      success: isSuccess,
      stdout: finalContent || stdout,
      stderr: stderr,
      raw: finalContent || stdout,
      usage: outputTokens ? { inputTokens: 0, outputTokens, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0, model: this.getModelName(invocation), effort: this.getEffort(invocation) } : undefined,
      session: sessionId ? { id: sessionId } : undefined,
      artefacts: extractJsonOrNull(finalContent || stdout) as Record<string, string> | undefined,
    }
  }
}

AgentRunnerRegistry.register({
  type: Runner.COPILOT_CLI,
  constructor: CopilotCLIRunner,
})