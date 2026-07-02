import { spawn } from 'node:child_process'
import type { IAgentRunner } from './IAgentRunner'
import type { AgentInvocation, AgentOutput } from './types'
import { AgentRunnerError, AgentRunnerErrorCode } from './AgentRunnerError'

/**
 * Abstract base class for all CLI subprocess runners.
 * Encapsulates the shared spawn/abort/kill/ENOENT pattern so concrete runners
 * only need to override `binaryName` and `buildArgs()`.
 */
export abstract class AbstractCliRunner implements IAgentRunner {
  protected abstract readonly binaryName: string
  protected abstract readonly timeoutMs: number

  protected abstract buildArgs(prompt: string, invocation: AgentInvocation): string[]

  protected get writePromptToStdin(): boolean {
    return false
  }

  protected getModelName(invocation: AgentInvocation): string | undefined {
    return undefined
  }

  protected parseOutput(
    stdout: string,
    stderr: string,
    invocation: AgentInvocation,
  ): Partial<AgentOutput> {
    return {}
  }

  protected checkParsed(
    _parsed: Partial<AgentOutput>,
    _invocation: AgentInvocation,
  ): AgentRunnerError | null {
    return null
  }

  protected onStdoutLine(_line: string, _invocation: AgentInvocation): void {
    // no-op — override in concrete runners for streaming progress
  }

  protected buildPrompt(invocation: AgentInvocation): string {
    return [
      `Skill: ${invocation.skill ?? 'unknown'}`,
      `Mode: ${invocation.mode}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')
  }

  async run(
    invocation: AgentInvocation,
    options?: { signal?: AbortSignal },
  ): Promise<AgentOutput> {
    const prompt = invocation.prompt ?? this.buildPrompt(invocation)
    const args = this.buildArgs(prompt, invocation)
    return this.spawnAndCollect(prompt, args, invocation, options)
  }

  private spawnAndCollect(
    prompt: string,
    args: string[],
    invocation: AgentInvocation,
    options?: { signal?: AbortSignal },
  ): Promise<AgentOutput> {
    return new Promise<AgentOutput>((resolve, reject) => {
      const child = spawn(this.binaryName, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })

      let timer: ReturnType<typeof setTimeout> | undefined
      const clearTimer = () => { if (timer) clearTimeout(timer) }

      const killProcessGroup = () => {
        clearTimer()
        if (child.pid) {
          if (process.platform === 'win32') {
            try { spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']) }
            catch { child.kill() }
          } else {
            try { process.kill(-child.pid, 'SIGKILL') }
            catch { child.kill() }
          }
        } else {
          child.kill()
        }
      }

      if (this.timeoutMs > 0) {
        timer = setTimeout(() => {
          killProcessGroup()
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.TIMEOUT,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `${this.binaryName} runner timed out after ${this.timeoutMs}ms`,
          }))
        }, this.timeoutMs)
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
      let lineBuffer = ''

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString()
        stdout += text
        lineBuffer += text
        const parts = lineBuffer.split('\n')
        lineBuffer = parts.pop() ?? ''
        for (const line of parts) {
          if (line.trim()) this.onStdoutLine(line, invocation)
        }
      })
      child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimer()
        if (err.code === 'ENOENT') {
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.NETWORK_ERROR,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `${this.binaryName} CLI not found — is it installed? (looked for: ${this.binaryName})`,
            cause: err,
          }))
        } else {
          reject(new AgentRunnerError({
            code: AgentRunnerErrorCode.API_ERROR,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `${this.binaryName} CLI error: ${err.message}`,
            cause: err,
          }))
        }
      })

      child.on('close', (code) => {
        clearTimer()
        if (code !== 0) {
          const isQuota = /rate.?limit|quota|overloaded/i.test(stderr)
          reject(new AgentRunnerError({
            code: isQuota ? AgentRunnerErrorCode.QUOTA_EXCEEDED : AgentRunnerErrorCode.UNKNOWN_ERROR,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `${this.binaryName} CLI exited with code ${code}`,
          }))
          return
        }

        const parsed = this.parseOutput(stdout, stderr, invocation)
        const parseError = this.checkParsed(parsed, invocation)
        if (parseError) { reject(parseError); return }

        resolve({
          success: true,
          stdout,
          stderr,
          raw: parsed.raw ?? stdout,
          artefacts: parsed.artefacts,
          usage: {
            inputTokens: parsed.usage?.inputTokens ?? 0,
            outputTokens: parsed.usage?.outputTokens ?? 0,
            cacheCreationTokens: parsed.usage?.cacheCreationTokens ?? 0,
            cacheReadTokens: parsed.usage?.cacheReadTokens ?? 0,
            costUsd: parsed.usage?.costUsd ?? 0,
            model: parsed.usage?.model ?? this.getModelName(invocation),
            effort: parsed.usage?.effort,
          },
        })
      })

      if (this.writePromptToStdin && child.stdin) {
        child.stdin.write(prompt, 'utf8')
      }
      child.stdin?.end()
    })
  }
}
