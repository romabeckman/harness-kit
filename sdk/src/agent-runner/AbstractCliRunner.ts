import { spawn } from 'node:child_process'
import type { IAgentRunner } from './IAgentRunner'
import type { AgentInvocation, AgentOutput } from './types'
import { AgentRunnerError, AgentRunnerErrorCode } from './AgentRunnerError'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../settings/DefaultSettings'
import { DebugContext } from '../cli/DebugContext'

/**
 * Abstract base class for all CLI subprocess runners.
 * Encapsulates the shared spawn/abort/kill/ENOENT pattern so concrete runners
 * only need to override `binaryName` and `buildArgs()`.
 */
export abstract class AbstractCliRunner implements IAgentRunner {
  /** CLI binary name passed as the first argument to `spawn`. */
  protected abstract readonly binaryName: string

  /** Milliseconds before the spawned process is force-killed. 0 = no timeout. */
  protected timeoutMs: number = DEFAULT_PHASE_TIMEOUT_MS

  /** Returns the argument list for the CLI invocation, excluding the binary itself. */
  protected abstract buildArgs(prompt: string, invocation: AgentInvocation): string[]

  /**
   * When true, the prompt is written to the child's stdin instead of being
   * appended as a positional arg. Use this when the CLI reads from stdin to
   * avoid OS ARG_MAX limits on long prompts.
   */
  protected get writePromptToStdin(): boolean {
    return false
  }

  /**
   * Returns the model name to use as fallback in `AgentOutput.usage.model`
   * when the runner's output does not include model information.
   */
  protected getModelName(invocation: AgentInvocation): string | undefined {
    return undefined
  }

  /**
   * Parses the raw stdout/stderr collected after the process closes.
   * Override to extract `raw`, `usage`, and `artefacts` from runner-specific output formats.
   * Called once, after the process exits with code 0.
   */
  protected parseOutput(
    stdout: string,
    stderr: string,
    invocation: AgentInvocation,
  ): Partial<AgentOutput> {
    return {}
  }

  /**
   * Validates the result of `parseOutput` and returns an `AgentRunnerError` to
   * reject with, or `null` to proceed with resolving. Override to detect logical
   * errors that are signalled inside the output (e.g. `is_error: true`) rather
   * than via a non-zero exit code.
   */
  protected checkParsed(
    _parsed: Partial<AgentOutput>,
    _invocation: AgentInvocation,
  ): AgentRunnerError | null {
    return null
  }

  /**
   * Called for every complete stdout line while the process is still running,
   * before `parseOutput`. Override for real-time streaming feedback such as
   * progress callbacks. Stateless by design — do not accumulate state here.
   */
  protected onStdoutLine(_line: string, _invocation: AgentInvocation): void {
    // no-op
  }

  /**
   * Builds a default prompt from the invocation payload when `invocation.prompt`
   * is not explicitly provided.
   */
  protected buildPrompt(invocation: AgentInvocation): string {
    return [
      `Skill: ${invocation.skill ?? 'unknown'}`,
      `Mode: ${invocation.mode}`,
      '',
      JSON.stringify(invocation.payload, null, 2),
    ].join('\n')
  }

  /** Entry point: resolves the prompt, builds args, and delegates to `spawnAndCollect`. */
  async run(
    invocation: AgentInvocation,
    options?: { signal?: AbortSignal },
  ): Promise<AgentOutput> {
    const prompt = invocation.prompt ?? this.buildPrompt(invocation)
    const args = this.buildArgs(prompt, invocation)
    if (invocation.timeoutMs) this.timeoutMs = invocation.timeoutMs
    return this.spawnAndCollect(prompt, args, invocation, options)
  }

  private spawnAndCollect(
    prompt: string,
    args: string[],
    invocation: AgentInvocation,
    options?: { signal?: AbortSignal },
  ): Promise<AgentOutput> {
    return new Promise<AgentOutput>((resolve, reject) => {
      if (DebugContext.enabled) {
        process.stderr.write(`[DEBUG] spawn: ${this.binaryName} ${args.join(' ')}\n\n`)
        process.stderr.write(`[DEBUG] timeout: ${this.timeoutMs}ms\n\n`)
      }

      const child = spawn(this.binaryName, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: { ...process.env, ...(invocation.env ?? {}) },
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
        if (DebugContext.enabled) {
          process.stderr.write(`[DEBUG] spawn error: ${err.stack ?? err.message}\n`)
        }
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
          const combined = (stderr + '\n' + stdout).trim()
          const isQuota = /rate.?limit|quota|overloaded/i.test(combined)
          const snippet = DebugContext.enabled ? combined : combined.slice(-1500)
          const detail = snippet ? `\n${snippet}` : ''
          if (DebugContext.enabled) {
            process.stderr.write(`[DEBUG] exit code: ${code}\n`)
          }
          reject(new AgentRunnerError({
            code: isQuota ? AgentRunnerErrorCode.QUOTA_EXCEEDED : AgentRunnerErrorCode.UNKNOWN_ERROR,
            skill: invocation.skill ?? 'unknown',
            phase: 'dispatch',
            message: `${this.binaryName} CLI exited with code ${code}${detail}`,
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
        if (DebugContext.enabled) {
          process.stderr.write(`[DEBUG] writing prompt to stdin:\n${prompt}\n\n`)
        }
        child.stdin.write(prompt, 'utf8')
      }
      child.stdin?.end()
    })
  }
}
