import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import spawn from 'cross-spawn'
import type { QaDriver, QaDriverExecutionContext, QaScenario, QaScenarioResult } from '../types'
import { redactSecrets } from './QaAuthRedaction'

export interface CliExecutionResult { code: number | null; stdout: string; stderr: string }
export type CliExecutor = (command: string, args: string[], cwd: string, signal?: AbortSignal, environment?: Record<string, string>) => Promise<CliExecutionResult>

const SAFE_COMMAND = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_ARGS = 100
const MAX_EXECUTION_MS = 30_000

export class CliDriver implements QaDriver {
  readonly profile = 'cli' as const

  constructor(private readonly executor: CliExecutor = executeCommand) {}

  async doctor(): Promise<{ available: boolean }> {
    return { available: true }
  }

  async execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal, context?: QaDriverExecutionContext): Promise<QaScenarioResult> {
    if (signal?.aborted) return blocked(scenario, signal.reason instanceof Error ? signal.reason.message : 'CLI execution cancelled')
    const request = scenario.cli
    if (!request) return blocked(scenario, 'CLI scenario has no command')
    if (!SAFE_COMMAND.test(request.command)) return blocked(scenario, 'CLI command must be a safe executable name without a path')
    const args = request.args ?? []
    if (args.length > MAX_ARGS || args.some((arg) => arg.includes('\0'))) return blocked(scenario, 'CLI arguments exceed safety bounds')
    const cwd = resolve(target)
    try {
      if (context?.auth.mode !== undefined && context.auth.mode !== 'none' && Object.keys(context.auth.environment).length === 0) {
        return blocked(scenario, `CLI authentication profile "${context.auth.profile}" requires explicit environment mappings`)
      }
      const environment = context?.auth.environment
      const execution = environment && Object.keys(environment).length > 0
        ? await this.executor(request.command, args, cwd, signal, environment)
        : await this.executor(request.command, args, cwd, signal)
      mkdirSync(evidenceDir, { recursive: true })
      const evidencePath = join(evidenceDir, 'cli.json')
      writeFileSync(evidencePath, JSON.stringify({ command: request.command, args: redactArgs(args, context?.auth), code: execution.code, stdout: redactSecrets(execution.stdout, context?.auth), stderr: redactSecrets(execution.stderr, context?.auth) }, null, 2), 'utf8')
      const evidence = [{ id: `${scenario.id}-cli`, path: evidencePath, capturedAt: new Date().toISOString(), adapter: 'cli' }]
      const failure = execution.code !== request.expectedExitCode
        ? `Expected exit code ${request.expectedExitCode}; observed ${execution.code}`
        : request.expectedStdoutContains && !execution.stdout.includes(request.expectedStdoutContains)
          ? `stdout does not contain ${JSON.stringify(request.expectedStdoutContains)}`
          : request.expectedStderrContains && !execution.stderr.includes(request.expectedStderrContains)
            ? `stderr does not contain ${JSON.stringify(request.expectedStderrContains)}`
            : undefined
      return { scenarioId: scenario.id, required: scenario.required, status: failure ? 'FAILED' : 'PASSED', reason: failure, evidence }
    } catch (error) {
      return blocked(scenario, error instanceof Error ? error.message : 'CLI execution failed')
    }
  }
}

function redactArgs(args: string[], auth?: QaDriverExecutionContext['auth']): string[] {
  let redactNext = false
  return args.map((arg) => {
    if (redactNext) {
      redactNext = false
      return '[REDACTED]'
    }
    if (/^--?(token|secret|password|authorization|cookie|api[-_]?key)$/i.test(arg)) {
      redactNext = true
      return arg
    }
    return redactSecrets(arg, auth).replace(/^(--?(?:token|secret|password|authorization|cookie|api[-_]?key)=).+$/i, '$1[REDACTED]')
  })
}

function executeCommand(command: string, args: string[], cwd: string, signal?: AbortSignal, environment?: Record<string, string>): Promise<CliExecutionResult> {
  return new Promise((resolveExecution, rejectExecution) => {
    if (signal?.aborted) return rejectExecution(signal.reason ?? new Error('CLI execution cancelled'))
    const child = spawn(command, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...environment } })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    let settled = false
    let escalation: ReturnType<typeof setTimeout> | undefined
    const deadline = setTimeout(() => stop(new Error(`CLI command exceeded ${MAX_EXECUTION_MS} ms deadline`)), MAX_EXECUTION_MS)
    const cleanup = () => {
      clearTimeout(deadline)
      if (escalation) clearTimeout(escalation)
      signal?.removeEventListener('abort', abort)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      rejectExecution(error)
    }
    const finish = (code: number | null) => {
      if (settled) return
      if (signal?.aborted) return fail(signal.reason ?? new Error('CLI execution cancelled'))
      settled = true
      cleanup()
      resolveExecution({ code, stdout, stderr })
    }
    const stop = (reason: Error) => {
      if (settled) return
      child.once('close', () => fail(reason))
      try { child.kill() } catch { /* The process may have exited already. */ }
      if (settled) return
      escalation = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* The process may have exited already. */ } }, 1_000)
    }
    const abort = () => stop(signal?.reason instanceof Error ? signal.reason : new Error('CLI execution cancelled'))
    child.once('error', (error) => fail(error))
    child.once('close', finish)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

function blocked(scenario: QaScenario, reason: string): QaScenarioResult {
  return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason, evidence: [] }
}
