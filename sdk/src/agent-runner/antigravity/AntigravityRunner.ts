import { spawn } from 'node:child_process'
import type { IAgentRunner } from '../IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../types'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'

export interface AntigravityRunnerConfig {
  readonly timeoutMs?: number
  readonly agyBin?: string
  readonly model?: string
}

export class AntigravityRunner implements IAgentRunner {
  readonly #config: Required<AntigravityRunnerConfig>

  constructor(config?: Partial<AntigravityRunnerConfig>) {
    this.#config = {
      timeoutMs: config?.timeoutMs ?? 0,
      agyBin: config?.agyBin ?? 'agy',
      model: config?.model ?? 'gemini-2.5-pro',
    }
  }

  async run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    const prompt = invocation.prompt || [
      `Skill: ${invocation.skill}`,
      `Mode: ${invocation.mode}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')

    const args = ['--prompt', prompt]
    if (this.#config.model) {
      args.push('--model', this.#config.model)
    }

    return new Promise<AgentOutput>((resolve, reject) => {
      const child = spawn(this.#config.agyBin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })

      let timer: ReturnType<typeof setTimeout> | undefined
      const clearTimer = () => { if (timer) clearTimeout(timer) }

      const cleanup = () => {
        clearTimer()
      }

      const killProcessGroup = () => {
        cleanup()
        if (child.pid) {
          if (process.platform === 'win32') {
            try {
              spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'])
            } catch {
              child.kill()
            }
          } else {
            try {
              process.kill(-child.pid, 'SIGKILL')
            } catch {
              child.kill()
            }
          }
        } else {
          child.kill()
        }
      }

      if (this.#config.timeoutMs > 0) {
        timer = setTimeout(() => {
          killProcessGroup()
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.TIMEOUT,
            skill: invocation.skill,
            phase: 'dispatch',
            message: `Antigravity runner timed out after ${this.#config.timeoutMs}ms`,
          }))
        }, this.#config.timeoutMs)
      }

      if (options?.signal) {
        if (options.signal.aborted) {
          killProcessGroup()
          reject(new Error('aborted'))
          return
        }
        options.signal.addEventListener('abort', () => {
          killProcessGroup()
          reject(new Error('aborted'))
        })
      }

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (err: NodeJS.ErrnoException) => {
        cleanup()
        if (err.code === 'ENOENT') {
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.NETWORK_ERROR,
            skill: invocation.skill,
            phase: 'dispatch',
            message: `Antigravity CLI not found — is agy installed? (looked for: ${this.#config.agyBin})`,
            cause: err,
          }))
        } else {
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.API_ERROR,
            skill: invocation.skill,
            phase: 'dispatch',
            message: `Antigravity CLI error: ${err.message}`,
            cause: err,
          }))
        }
      })

      child.on('close', (code) => {
        cleanup()
        if (code !== 0) {
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.API_ERROR,
            skill: invocation.skill,
            phase: 'dispatch',
            message: `Antigravity CLI exited with code ${code}`,
          }))
          return
        }

        resolve({
          success: true,
          stdout,
          stderr,
          raw: stdout,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            costUsd: 0,
            model: this.#config.model,
          }
        })
      })

      child.stdin.write(prompt, 'utf8')
      child.stdin.end()
    })
  }
}

AgentRunnerRegistry.register({
  type: 'antigravity',
  constructor: AntigravityRunner,
})
