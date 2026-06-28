import type { IAgentRunner } from '../IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'

export interface OpenCodeRunnerConfig {
  readonly model?: string
  readonly serverUrl?: string   // override for pre-started server; skips createOpencode()
  readonly timeoutMs?: number
}

/**
 * SDK-based runner for OpenCode (opencode.ai).
 * Uses @opencode-ai/sdk (peerDependency — consumer must install it).
 *
 * Flow:
 *  1. createOpencode() — starts local opencode server
 *  2. createOpencodeClient({ baseUrl }) — creates HTTP client
 *  3. session.create() → session.prompt({ text }) → raw output
 *  4. server.stop() in finally — always cleanup
 */
export class OpenCodeRunner implements IAgentRunner {
  readonly type = 'opencode'
  readonly #model: string | undefined
  readonly #serverUrl: string | undefined
  readonly #timeoutMs: number

  constructor(config?: Partial<OpenCodeRunnerConfig>) {
    this.#model = config?.model
    this.#serverUrl = config?.serverUrl
    this.#timeoutMs = config?.timeoutMs ?? 0
  }

  async run(
    invocation: AgentInvocation,
    options?: { signal?: AbortSignal },
  ): Promise<AgentOutput> {
    // Lazy import — @opencode-ai/sdk is a peerDependency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sdk: any
    try {
      // Use dynamic variable to prevent compile-time resolution of optional peer dependency
      const sdkName = '@opencode-ai/sdk'
      sdk = await import(sdkName)
    } catch {
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.NETWORK_ERROR,
        skill: invocation.skill ?? 'unknown',
        phase: 'dispatch',
        message: 'OpenCodeRunner requires @opencode-ai/sdk — run: npm install @opencode-ai/sdk',
      })
    }

    const { createOpencode, createOpencodeClient } = sdk

    const prompt = invocation.prompt ?? this.#buildPrompt(invocation)

    // Single AbortController: drives both external signal and internal timeout.
    const controller = new AbortController()

    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort()
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    if (this.#timeoutMs > 0) {
      timer = setTimeout(() => controller.abort(), this.#timeoutMs)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any = null

    try {
      const model = invocation.model ?? this.#model
      // Use pre-started server URL if provided, otherwise start one
      let client: any
      if (this.#serverUrl) {
        client = createOpencodeClient({ baseUrl: this.#serverUrl })
      } else {
        const opencodeApp = await createOpencode({
          config: model ? { model } : {},
        })
        server = opencodeApp.server
        client = opencodeApp.client
      }

      const session = await client.session.create({
        body: { title: 'hrns-session' },
      })
      const sessionId = session.id

      // Parse model if specified (provider/model format)
      let modelConfig: any = undefined
      if (model && model.includes('/')) {
        const [providerID, modelID] = model.split('/')
        modelConfig = { providerID, modelID }
      }

      // Forward signal so the SDK can cancel the underlying HTTP request.
      // If the SDK does not accept signal, the abort controller will still
      // reject via the controller.signal 'abort' event below.
      const promptResult = await client.session.prompt(
        {
          path: { id: sessionId },
          body: {
            model: modelConfig,
            parts: [{ type: 'text', text: prompt }],
          },
        },
        { signal: controller.signal }
      )

      clearTimeout(timer)

      const raw = this.#extractRaw(promptResult)

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
          model,
        },
      }
    } catch (err: any) {
      clearTimeout(timer)
      if (controller.signal.aborted) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.TIMEOUT,
          skill: invocation.skill ?? 'unknown',
          phase: 'dispatch',
          message: `OpenCode runner timed out or was aborted after ${this.#timeoutMs}ms`,
          cause: err as Error,
        })
      }
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.UNKNOWN_ERROR,
        skill: invocation.skill ?? 'unknown',
        phase: 'dispatch',
        message: `OpenCode SDK error: ${err.message || String(err)}`,
        cause: err as Error,
      })
    } finally {
      if (server) {
        try {
          await server.close()
        } catch { /* best-effort cleanup */ }
      }
    }
  }

  #buildPrompt(invocation: AgentInvocation): string {
    return [
      `Skill: ${invocation.skill ?? 'unknown'}`,
      `Mode: ${invocation.mode}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')
  }

  #extractRaw(result: any): string {
    // Attempt to extract text from parts list
    const parts = result?.parts || result?.data?.parts
    if (Array.isArray(parts)) {
      const text = parts
        .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('\n')
      if (text) return text
    }

    // Fallbacks for other structures
    if (typeof result?.data?.output === 'string') return result.data.output
    if (typeof result?.data?.text === 'string') return result.data.text
    if (typeof result?.output === 'string') return result.output
    if (typeof result === 'string') return result
    return JSON.stringify(result)
  }
}

AgentRunnerRegistry.register({
  type: 'opencode',
  constructor: OpenCodeRunner,
  // No validateConfig — OpenCode reads env vars (ANTHROPIC_API_KEY etc.) itself
})
