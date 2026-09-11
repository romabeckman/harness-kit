import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import spawn from 'cross-spawn'
import type { QaDriver, QaScenario, QaScenarioResult } from './types'

export class CurlDriver implements QaDriver {
  readonly profile = 'api' as const

  async doctor(): Promise<{ available: boolean; reason?: string }> {
    return new Promise((resolve) => {
      const command = process.platform === 'win32' ? 'curl.exe' : 'curl'
      const child = spawn(command, ['--version'], { stdio: 'ignore' })
      child.once('error', () => resolve({ available: false, reason: 'curl executable is unavailable' }))
      child.once('close', (code) => resolve(code === 0 ? { available: true } : { available: false, reason: 'curl --version failed' }))
    })
  }

  async execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal): Promise<QaScenarioResult> {
    if (!scenario.request) return this.blocked(scenario, 'API scenario has no HTTP request')
    mkdirSync(evidenceDir, { recursive: true })
    const responsePath = join(evidenceDir, 'response.body')
    const requestPath = join(evidenceDir, 'request.json')
    const request = scenario.request
    const url = new URL(request.path, target).toString()
    writeFileSync(requestPath, JSON.stringify({ method: request.method, url, headers: request.headers ?? {} }, null, 2), 'utf8')
    const args = ['--silent', '--show-error', '--location', '--output', responsePath, '--write-out', '%{http_code}', '--request', request.method]
    for (const [name, value] of Object.entries(request.headers ?? {})) args.push('--header', `${name}: ${value}`)
    if (request.body !== undefined) args.push('--data-raw', request.body)
    args.push(url)
    const result = await this.runCurl(args, signal)
    const status = Number.parseInt(result.stdout.trim(), 10)
    const evidence = [
      { id: `${scenario.id}-request`, path: requestPath, capturedAt: new Date().toISOString(), adapter: 'curl' },
      { id: `${scenario.id}-response`, path: responsePath, capturedAt: new Date().toISOString(), adapter: 'curl' },
    ]
    if (result.code !== 0 || !Number.isSafeInteger(status)) {
      return { scenarioId: scenario.id, required: scenario.required, status: 'INCONCLUSIVE', reason: result.stderr || 'curl failed before an HTTP response', evidence }
    }
    return {
      scenarioId: scenario.id,
      required: scenario.required,
      status: status === request.expectedStatus ? 'PASSED' : 'FAILED',
      observedStatus: status,
      reason: status === request.expectedStatus ? undefined : `Expected HTTP ${request.expectedStatus}; observed HTTP ${status}`,
      evidence,
    }
  }

  private blocked(scenario: QaScenario, reason: string): QaScenarioResult {
    return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason, evidence: [] }
  }

  private runCurl(args: string[], signal?: AbortSignal): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const command = process.platform === 'win32' ? 'curl.exe' : 'curl'
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
      child.once('error', (error) => resolve({ code: null, stdout, stderr: error.message }))
      child.once('close', (code) => resolve({ code, stdout, stderr }))
      signal?.addEventListener('abort', () => child.kill(), { once: true })
    })
  }
}
