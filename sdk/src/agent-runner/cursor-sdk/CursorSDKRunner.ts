import { Agent } from '@cursor/sdk'
import type { IAgentRunner } from '../IAgentRunner'
import { Runner, type AgentInvocation, type AgentOutput } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../settings/DefaultSettings'

export interface CursorSDKRunnerConfig {
  readonly model?: string
  readonly timeoutMs?: number
}

export class CursorSDKRunner implements IAgentRunner {
  readonly type = Runner.CURSOR_SDK
  readonly #model: string | undefined
  readonly timeoutMs: number

  constructor(config?: Partial<CursorSDKRunnerConfig>) {
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_PHASE_TIMEOUT_MS
    this.#model = config?.model
  }

  async run(
    invocation: AgentInvocation,
    options?: { signal?: AbortSignal },
  ): Promise<AgentOutput> {
    const apiKey = process.env.CURSOR_API_KEY
    if (!apiKey) {
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.MISSING_API_KEY,
        skill: invocation.skill ?? '',
        phase: 'dispatch',
        message: 'CursorSDKRunner requires CURSOR_API_KEY environment variable to be set',
      })
    }

    const modelName = invocation.model ?? this.#model ?? 'composer-2.5'
    const reasoningEffort = invocation.effort

    const params: { id: string; value: string }[] = []
    if (reasoningEffort) {
      params.push({ id: 'reasoning-effort', value: reasoningEffort })
    }

    const agent = await Agent.create({
      apiKey,
      model: {
        id: modelName,
        params,
      },
      local: {
        cwd: invocation.workspacePath ?? process.cwd(),
      },
    })

    const controller = new AbortController()
    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort()
      }
      options.signal.addEventListener('abort', () => {
        controller.abort()
      })
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    let isTimeout = false

    const abortPromise = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) {
        reject(new Error('aborted'))
        return
      }
      controller.signal.addEventListener('abort', () => {
        if (!isTimeout) {
          reject(new Error('aborted'))
        }
      })
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      if (this.timeoutMs > 0) {
        timer = setTimeout(() => {
          isTimeout = true
          controller.abort()
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.TIMEOUT,
            skill: invocation.skill ?? '',
            phase: 'dispatch',
            message: `Cursor SDK runner timed out after ${this.timeoutMs}ms`,
          }))
        }, this.timeoutMs)
      }
    })

    let run: any
    try {
      const prompt = invocation.prompt ?? this.#buildPrompt(invocation)
      run = await agent.send(prompt)

      const workPromise = (async () => {
        const result = await run.wait()
        clearTimeout(timer)

        if (result.status === 'cancelled') {
          throw new Error('aborted')
        }
        if (result.status === 'error') {
          throw new AgentRunnerError({
            code: AgentRunnerErrorCode.UNKNOWN_ERROR,
            skill: invocation.skill ?? '',
            phase: 'dispatch',
            message: `Cursor SDK run ended with error`,
          })
        }

        const raw = result.result ?? ''

        return {
          success: true,
          stdout: raw,
          stderr: '',
          raw,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            costUsd: 0,
            model: modelName,
            effort: reasoningEffort,
          },
        }
      })()

      return await Promise.race([workPromise, abortPromise, timeoutPromise])
    } catch (err: any) {
      clearTimeout(timer)
      if (run) {
        try {
          await run.cancel()
        } catch {
          // ignore
        }
      }
      if (err instanceof AgentRunnerError) {
        throw err
      }
      if (controller.signal.aborted || err.message === 'aborted') {
        throw new Error('aborted')
      }
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.UNKNOWN_ERROR,
        skill: invocation.skill ?? '',
        phase: 'dispatch',
        message: `Cursor SDK error: ${err.message || String(err)}`,
        cause: err,
      })
    } finally {
      try {
        agent.close()
      } catch {
        // ignore
      }
    }
  }

  #buildPrompt(invocation: AgentInvocation): string {
    return [
      `Skill: ${invocation.skill ?? ''}`,
      `Mode: ${invocation.mode}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')
  }
}

AgentRunnerRegistry.register({
  type: Runner.CURSOR_SDK,
  constructor: CursorSDKRunner,
  validateConfig: () => {
    if (!process.env.CURSOR_API_KEY) {
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.MISSING_API_KEY,
        skill: 'unknown',
        phase: 'validate',
        message: 'CursorSDKRunner requires CURSOR_API_KEY environment variable to be set',
      })
    }
  },
})
