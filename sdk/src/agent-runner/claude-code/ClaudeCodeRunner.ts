import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { IAgentRunner } from '../IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../types'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'

export interface ClaudeCodeRunnerConfig {
  readonly timeoutMs: number
  readonly claudeBin: string
  readonly model?: string   // passed as --model to claude CLI
  readonly effort?: string  // passed as --effort to claude CLI ('low'|'medium'|'high'|'max')
  readonly onProgress?: (line: ProgressLine) => void
}

export interface ProgressLine {
  agent: string
  skill: string
  type: 'text' | 'tool_use' | 'tool_result' | 'result'
  text?: string
  toolName?: string
  isError?: boolean
}

const DEFAULT_CONFIG: Omit<ClaudeCodeRunnerConfig, 'onProgress' | 'model' | 'effort'> = Object.freeze({
  timeoutMs: 0, // 0 = no timeout — agents can run for hours
  claudeBin: 'claude',
})

function defaultProgress(line: ProgressLine): void {
  const tag = `[${line.skill}]`
  if (line.type === 'text' && line.text) {
    const preview = line.text.replace(/\n/g, ' ').slice(0, 120)
    process.stderr.write(`${tag} ${preview}\n`)
  } else if (line.type === 'tool_use' && line.toolName) {
    process.stderr.write(`${tag} → ${line.toolName}\n`)
  } else if (line.type === 'result') {
    process.stderr.write(`${tag} ✓ done\n`)
  }
}

function extractJson(raw: string): unknown | null {
  const fenceMatch = raw.match(/```json\s*\n([\s\S]*?)\n```/)
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]) } catch { /* fall through */ }
  }
  const start = raw.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let end = -1
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) return null
  try { return JSON.parse(raw.slice(start, end + 1)) } catch { return null }
}

export class ClaudeCodeRunner implements IAgentRunner {
  readonly #config: ClaudeCodeRunnerConfig & { onProgress: (line: ProgressLine) => void }

  constructor(config?: Partial<ClaudeCodeRunnerConfig>) {
    this.#config = {
      ...DEFAULT_CONFIG,
      onProgress: defaultProgress,
      ...config,
    }
  }

  async run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    const prompt = this.#buildPrompt(invocation)
    const onProgress = this.#config.onProgress

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--input-format', 'text',
      '--dangerously-skip-permissions',
    ]

    if (this.#config.model) args.push('--model', this.#config.model)
    if (this.#config.effort) args.push('--effort', this.#config.effort)
    if (invocation.agent) args.push('--agent', invocation.agent)

    return new Promise<AgentOutput>((resolve, reject) => {
      const child = spawn(this.#config.claudeBin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let timer: ReturnType<typeof setTimeout> | undefined
      if (this.#config.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill()
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.TIMEOUT,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `claude CLI timed out after ${this.#config.timeoutMs}ms`,
          }))
        }, this.#config.timeoutMs)
      }

      const clearTimer = () => { if (timer) clearTimeout(timer) }

      if (options?.signal) {
        if (options.signal.aborted) {
          clearTimer()
          child.kill()
          reject(new Error('aborted'))
          return
        }
        options.signal.addEventListener('abort', () => {
          clearTimer()
          child.kill()
          reject(new Error('aborted'))
        })
      }

      let finalResult = ''
      let isFinalError = false
      let finalUsage: import('../types').TokenUsage | undefined

      const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })

      rl.on('line', (raw) => {
        let event: Record<string, unknown>
        try { event = JSON.parse(raw) as Record<string, unknown> }
        catch { return }

        const type = event.type as string

        // assistant message — extract text and tool_use blocks
        if (type === 'assistant') {
          const msg = event.message as { content?: unknown[] } | undefined
          const content = msg?.content ?? []
          for (const block of content) {
            const b = block as Record<string, unknown>
            if (b.type === 'text' && typeof b.text === 'string') {
              onProgress({ agent: invocation.agent, skill: invocation.skill ?? 'unknown', type: 'text', text: b.text })
            } else if (b.type === 'tool_use' && typeof b.name === 'string') {
              onProgress({ agent: invocation.agent, skill: invocation.skill ?? 'unknown', type: 'tool_use', toolName: b.name })
            }
          }
        }

        // final result line — extract usage + cost
        if (type === 'result') {
          const subtype = event.subtype as string
          isFinalError = event.is_error === true || subtype === 'error'
          finalResult = typeof event.result === 'string' ? event.result : ''

          const u = event.usage as Record<string, number> | undefined
          if (u) {
            // extract model from modelUsage — first key is the model id
            const modelUsage = event.modelUsage as Record<string, unknown> | undefined
            const detectedModel = modelUsage ? Object.keys(modelUsage)[0] : this.#config.model

            finalUsage = {
              inputTokens: u.input_tokens ?? 0,
              outputTokens: u.output_tokens ?? 0,
              cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
              cacheReadTokens: u.cache_read_input_tokens ?? 0,
              costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : 0,
              model: detectedModel,
              effort: this.#config.effort,
            }
          }

          onProgress({ agent: invocation.agent, skill: invocation.skill ?? 'unknown', type: 'result', isError: isFinalError })
        }
      })

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimer()
        if (err.code === 'ENOENT') {
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.NETWORK_ERROR,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `claude CLI not found — is Claude Code installed? (looked for: ${this.#config.claudeBin})`,
            cause: err,
          }))
        } else {
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.API_ERROR,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `claude CLI error: ${err.message}`,
            cause: err,
          }))
        }
      })

      child.on('close', (code) => {
        clearTimer()
        if (isFinalError) {
          const isQuota = /rate.?limit|quota|overloaded/i.test(finalResult)
          reject(new AgentRunnerError({
            code: isQuota ? AgentRunnerErrorCode.QUOTA_EXCEEDED : AgentRunnerErrorCode.API_ERROR,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `agent returned error: ${finalResult.slice(0, 200)}`,
          }))
          return
        }
        if (code !== 0 && !finalResult) {
          const stderrText = stderr ?? ''
          const isQuota = /rate.?limit|quota|overloaded/i.test(stderrText)
          reject(new AgentRunnerError({
            code: isQuota ? AgentRunnerErrorCode.QUOTA_EXCEEDED : AgentRunnerErrorCode.UNKNOWN_ERROR,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `claude CLI exited with code ${code} and no result`,
          }))
          return
        }
         resolve({
          success: !isFinalError,
          stdout: finalResult,
          stderr: '',
          raw: finalResult,
          usage: finalUsage,
          artefacts: (() => {
            const j = extractJson(finalResult)
            if (j && typeof j === 'object' && !Array.isArray(j)) {
              return j as Record<string, string>
            }
            return undefined
          })(),
        })
      })

      child.stdin.write(prompt, 'utf8')
      child.stdin.end()
    })
  }

  #buildPrompt(invocation: AgentInvocation): string {
    if (invocation.prompt) return invocation.prompt
    return [
      `Skill: ${invocation.skill ?? 'unknown'}`,
      `Mode: ${invocation.mode}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')
  }
}

AgentRunnerRegistry.register({
  type: 'claude-code',
  constructor: ClaudeCodeRunner,
})
