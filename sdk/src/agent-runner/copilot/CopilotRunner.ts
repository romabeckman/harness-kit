import { IAgentRunner } from '../IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { CopilotClient, approveAll } from '@github/copilot-sdk'

export interface CopilotRunnerConfig {
  readonly type: 'copilot'
  readonly model?: string
  readonly timeoutMs?: number
}

export class CopilotRunner implements IAgentRunner {
  private readonly config: CopilotRunnerConfig

  constructor(config?: Partial<CopilotRunnerConfig>) {
    this.config = {
      type: 'copilot',
      model: config?.model ?? 'gpt-5.1-codex-mini',
      timeoutMs: config?.timeoutMs ?? 600_000,
    }
  }

  async run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    const client = new CopilotClient()
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

    let session: any
    try {
      session = await client.createSession({
        model: this.config.model,
        workingDirectory: invocation.workspacePath ?? process.cwd(),
        onPermissionRequest: approveAll,
      })

      const prompt = this.buildPrompt(invocation)

      const runPromise = session.sendAndWait({ prompt }, this.config.timeoutMs)
      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error('AbortError'))
        })
      })

      // Race execution
      await Promise.race([runPromise, abortPromise])
      clearTimeout(timer)

      // Get output from session or stdout. Since copilot runs in place, we can return success
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
          model: this.config.model,
        },
      }
    } catch (err: any) {
      clearTimeout(timer)
      if (controller.signal.aborted) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.TIMEOUT,
          skill: invocation.skill ?? 'unknown',
          phase: 'dispatch',
          message: `Agent invocation timed out after ${this.config.timeoutMs}ms`,
          cause: err as Error,
        })
      }
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.API_ERROR,
        skill: invocation.skill ?? 'unknown',
        phase: 'dispatch',
        message: `Copilot Client Error: ${err.message || String(err)}`,
        cause: err as Error,
      })
    } finally {
      if (session) {
        try {
          await session.destroy()
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
      `Skill: ${invocation.skill ?? 'unknown'}`,
      `Agent: ${invocation.agent}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')
  }
}

// Register with AgentRunnerRegistry
AgentRunnerRegistry.register({
  type: 'copilot',
  constructor: CopilotRunner,
})
