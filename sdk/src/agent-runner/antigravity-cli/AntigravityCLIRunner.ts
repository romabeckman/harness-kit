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

  protected override get writePromptToStdin(): boolean {
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
    return args
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

    if (!parsedJson || typeof parsedJson !== 'object') {
      return {
        success: true,
        stdout,
        stderr,
        raw: stdout,
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
    const isError = status === 'FAILED' || status === 'ERROR'
    const rawResponse = typeof parsedJson.response === 'string' ? parsedJson.response : stdout

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
    }
  }
}

AgentRunnerRegistry.register({
  type: Runner.ANTIGRAVITY_CLI,
  constructor: AntigravityCLIRunner,
})
