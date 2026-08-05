import { IAgentRunner } from '../IAgentRunner'
import { Runner, type AgentInvocation, type AgentOutput } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../settings/DefaultSettings'

export interface CopilotSDKRunnerConfig {
  readonly type: Runner.COPILOT_SDK
  readonly model?: string
  readonly timeoutMs?: number
}

export class CopilotSDKRunner implements IAgentRunner {
  readonly type = Runner.COPILOT_SDK
  private readonly config: CopilotSDKRunnerConfig

  constructor(config?: Partial<CopilotSDKRunnerConfig>) {
    this.config = {
      type: Runner.COPILOT_SDK,
      model: config?.model ?? 'gpt-5.3-codex',
      timeoutMs: config?.timeoutMs ?? DEFAULT_PHASE_TIMEOUT_MS,
    }
  }

  async run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    const { CopilotClient, approveAll } = await import('@github/copilot-sdk')
    const client = new CopilotClient({
      workingDirectory: invocation.workspacePath ?? process.cwd(),
      env: invocation.env,
    })
    await client.start()

    const controller = new AbortController()
    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort()
      }
      options.signal.addEventListener('abort', () => {
        controller.abort()
      })
    }

    const timer = setTimeout(() => {
      controller.abort()
    }, this.config.timeoutMs)

    const model = invocation.model ?? this.config.model
    const reasoningEffort = invocation.effort as 'low' | 'medium' | 'high' | 'xhigh' | undefined
    let session: any
    try {
      session = await client.createSession({
        model,
        onPermissionRequest: approveAll,
        ...(reasoningEffort ? { reasoningEffort } : {}),
      })

      const prompt = this.buildPrompt(invocation)

      // Forward the single AbortController signal to the SDK so it can cancel
      // the underlying HTTP request natively. No redundant Promise.race needed.
      await session.sendAndWait({ prompt }, { signal: controller.signal })
      clearTimeout(timer)

      // Get output from session or stdout. Since copilot-sdk runs in place, we can return success
      return {
        success: true,
        stdout: 'Copilot session executed successfully',
        stderr: '',
        raw: 'Copilot session executed successfully',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          costUsd: 0,
          model,
        },
      }
    } catch (err: any) {
      clearTimeout(timer)
      if (controller.signal.aborted) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.TIMEOUT,
          skill: invocation.skill ?? '',
          phase: 'dispatch',
          message: `Agent invocation timed out after ${this.config.timeoutMs}ms`,
          cause: err as Error,
        })
      }
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.API_ERROR,
        skill: invocation.skill ?? '',
        phase: 'dispatch',
        message: `Copilot Client Error: ${err.message || String(err)}`,
        cause: err as Error,
      })
    } finally {
      if (session) {
        try {
          await session.disconnect()
        } catch {
          // ignore
        }
      }
      try {
        await client.stop()
      } catch {
        // ignore
      }
    }
  }

  private buildPrompt(invocation: AgentInvocation): string {
    if (invocation.prompt) {
      return invocation.prompt
    }
    return [
      `Skill: ${invocation.skill ?? ''}`,
      `Agent: ${invocation.agent}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')
  }
}

// Register with AgentRunnerRegistry
AgentRunnerRegistry.register({
  type: Runner.COPILOT_SDK,
  constructor: CopilotSDKRunner,
})
