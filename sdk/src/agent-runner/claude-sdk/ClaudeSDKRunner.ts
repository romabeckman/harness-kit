import Anthropic from '@anthropic-ai/sdk'
import type { IAgentRunner } from '../IAgentRunner'
import { Runner, type AgentInvocation, type AgentOutput } from '../types'
import { type AgentRunnerConfig, DEFAULT_AGENT_RUNNER_CONFIG } from './AgentRunnerConfig'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { extractJsonOrNull } from '../CliRunnerProgress'

// ─── Internal value object ────────────────────────────────────────────────────
interface AgentResult {
  readonly rawOutput: string
  readonly extractedJson: unknown | null
}

// ─── Type guards ──────────────────────────────────────────────────────────────
function isStringRecord(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === 'string'
  )
}

/**
 * Detect Anthropic SDK HTTP status errors (4xx/5xx).
 * Uses name-based detection to remain compatible with Vitest mocks that cannot
 * replicate the real SDK's prototype chain across module boundaries.
 */
function isApiStatusError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  // Real SDK: subclasses of APIError (BadRequestError, AuthenticationError, …)
  // all have .status and no "Connection" in name. Mocked class named 'APIStatusError'.
  return name === 'APIStatusError' ||
    (typeof (err as { status?: unknown }).status === 'number' &&
      name !== 'APIConnectionError' &&
      name !== 'APIConnectionTimeoutError' &&
      name !== 'APIUserAbortError')
}

function isConnectionError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  return name === 'APIConnectionError' || name === 'APIConnectionTimeoutError'
}

function isQuotaError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false
  const status = (err as { status?: unknown }).status
  const msg = ((err as { message?: string }).message ?? '').toLowerCase()
  return status === 429
    || msg.includes('rate_limit')
    || msg.includes('overloaded_error')
    || msg.includes('quota')
}

// ─── ClaudeSDKRunner ────────────────────────────────────────────────────────
export class ClaudeSDKRunner implements IAgentRunner {
  readonly type = Runner.CLAUDE_SDK
  readonly #config: AgentRunnerConfig
  readonly #client: Anthropic

  constructor(config?: Partial<AgentRunnerConfig>) {
    this.#config = Object.freeze({ ...DEFAULT_AGENT_RUNNER_CONFIG, ...config })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.MISSING_API_KEY,
        skill: 'unknown',
        phase: 'construction',
        message: 'ANTHROPIC_API_KEY environment variable is not set',
      })
    }

    this.#client = new Anthropic({ apiKey })
  }

  async run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    const controller = new AbortController()
    const model = invocation.model ?? this.#config.model

    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort()
      }
      options.signal.addEventListener('abort', () => {
        controller.abort()
      })
    }

    // Race the API call against an abort-triggered rejection so tests with
    // fake timers can observe the timeout without the mock needing to handle
    // the signal directly.
    const abortPromise = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error('AbortError'))
      })
    })

    const timer = setTimeout(() => controller.abort(), this.#config.timeoutMs)

    let result: AgentResult
    let usage: import('../types').TokenUsage | undefined

    try {
      // Pass signal in options (second parameter), not in the params object
      const response = await Promise.race([
        this.#client.messages.create(
          {
            model: model,
            max_tokens: this.#config.max_output_token,
            messages: [{ role: 'user', content: this.#buildPrompt(invocation) }],
          },
          { signal: controller.signal }
        ),
        abortPromise,
      ])

      clearTimeout(timer)

      // response is Anthropic.Message — access content blocks
      const rawOutput = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      result = {
        rawOutput,
        extractedJson: extractJsonOrNull(rawOutput),
      }

      usage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cacheCreationTokens: (response.usage as any)?.cache_creation_input_tokens ?? 0,
        cacheReadTokens: (response.usage as any)?.cache_read_input_tokens ?? 0,
        costUsd: 0,
        model: model,
      }
    } catch (err) {
      clearTimeout(timer)

      if (controller.signal.aborted) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.TIMEOUT,
          skill: invocation.skill ?? '',
          phase: 'dispatch',
          message: `Agent invocation timed out after ${this.#config.timeoutMs}ms`,
          cause: err as Error,
        })
      }

      if (isConnectionError(err)) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.NETWORK_ERROR,
          skill: invocation.skill ?? '',
          phase: 'dispatch',
          message: `Network failure during agent invocation: ${(err as Error).message}`,
          cause: err as Error,
        })
      }

      if (isQuotaError(err)) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.QUOTA_EXCEEDED,
          skill: invocation.skill ?? '',
          phase: 'dispatch',
          message: `API quota or rate limit exceeded: ${(err as Error).message}`,
          cause: err as Error,
        })
      }

      if (isApiStatusError(err)) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.API_ERROR,
          skill: invocation.skill ?? '',
          phase: 'dispatch',
          message: `Anthropic API returned an error status: ${(err as { message: string }).message}`,
          cause: err as Error,
        })
      }

      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.UNKNOWN_ERROR,
        skill: invocation.skill ?? '',
        phase: 'dispatch',
        message: `Unexpected error during agent invocation: ${(err as Error).message}`,
        cause: err as Error,
      })
    }

    return {
      success: true,
      stdout: result.rawOutput,
      stderr: '',
      raw: result.rawOutput,
      artefacts: isStringRecord(result.extractedJson) ? result.extractedJson : undefined,
      usage,
    }
  }

  #buildPrompt(invocation: AgentInvocation): string {
    if (invocation.prompt) return invocation.prompt
    return [
      `Skill: ${invocation.skill ?? ''}`,
      `Agent: ${invocation.agent}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')
  }
}

AgentRunnerRegistry.register({
  type: Runner.CLAUDE_SDK,
  constructor: ClaudeSDKRunner,
})
