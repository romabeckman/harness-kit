import Anthropic from '@anthropic-ai/sdk'
import type { IAgentRunner } from '../IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../types'
import { type AgentRunnerConfig, DEFAULT_AGENT_RUNNER_CONFIG } from './AgentRunnerConfig'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'

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

// ─── JSON extraction ──────────────────────────────────────────────────────────
function extractJson(raw: string): unknown | null {
  // Strategy 1: markdown code fence ```json ... ```
  const fenceMatch = raw.match(/```json\s*\n([\s\S]*?)\n```/)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1])
    } catch {
      // fall through
    }
  }

  // Strategy 2: bare JSON — find first { or [ and matching closer
  const startBrace = raw.indexOf('{')
  const startBracket = raw.indexOf('[')

  let start = -1
  let openChar: '{' | '[' | undefined
  let closeChar: '}' | ']' | undefined

  if (startBrace !== -1 && (startBracket === -1 || startBrace < startBracket)) {
    start = startBrace
    openChar = '{'
    closeChar = '}'
  } else if (startBracket !== -1) {
    start = startBracket
    openChar = '['
    closeChar = ']'
  }

  if (start !== -1 && openChar && closeChar) {
    let depth = 0
    let end = -1
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === openChar) depth++
      else if (raw[i] === closeChar) {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end !== -1) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch {
        // fall through
      }
    }
  }

  // Strategy 3: no JSON found
  return null
}

// ─── ClaudeAgentRunner ────────────────────────────────────────────────────────
export class ClaudeAgentRunner implements IAgentRunner {
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
    try {
      // Pass signal in options (second parameter), not in the params object
      const response = await Promise.race([
        this.#client.messages.create(
          {
            model: this.#config.model,
            max_tokens: 8192,
            messages: [{ role: 'user', content: this.#buildUserMessage(invocation) }],
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
        extractedJson: extractJson(rawOutput),
      }
    } catch (err) {
      clearTimeout(timer)

      if (controller.signal.aborted) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.TIMEOUT,
          skill: invocation.skill ?? 'unknown',
          phase: 'dispatch',
          message: `Agent invocation timed out after ${this.#config.timeoutMs}ms`,
          cause: err as Error,
        })
      }

      if (isConnectionError(err)) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.NETWORK_ERROR,
          skill: invocation.skill ?? 'unknown',
          phase: 'dispatch',
          message: `Network failure during agent invocation: ${(err as Error).message}`,
          cause: err as Error,
        })
      }

      if (isApiStatusError(err)) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.API_ERROR,
          skill: invocation.skill ?? 'unknown',
          phase: 'dispatch',
          message: `Anthropic API returned an error status: ${(err as { message: string }).message}`,
          cause: err as Error,
        })
      }

      throw new AgentRunnerError({
        code: AgentRunnerErrorCode.NETWORK_ERROR,
        skill: invocation.skill ?? 'unknown',
        phase: 'dispatch',
        message: `Network failure during agent invocation: ${(err as Error).message}`,
        cause: err as Error,
      })
    }

    return {
      success: true,
      stdout: result.rawOutput,
      stderr: '',
      raw: result.rawOutput,
      artefacts: isStringRecord(result.extractedJson) ? result.extractedJson : undefined,
    }
  }

  #buildUserMessage(invocation: AgentInvocation): string {
    return [
      `Skill: ${invocation.skill ?? 'unknown'}`,
      `Agent: ${invocation.agent}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')
  }
}

AgentRunnerRegistry.register({
  type: 'claude-agent',
  constructor: ClaudeAgentRunner,
})
