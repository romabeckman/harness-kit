import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import spawn from 'cross-spawn'
import type { QaDriver, QaScenario, QaScenarioResult } from '../types'

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
    if (signal?.aborted) return this.blocked(scenario, String(signal.reason ?? 'QA execution cancelled'))
    if (!scenario.request) return this.blocked(scenario, 'API scenario has no HTTP request')
    mkdirSync(evidenceDir, { recursive: true })
    const responsePath = join(evidenceDir, 'response.body')
    const responseHeadersPath = join(evidenceDir, 'response.headers')
    const requestPath = join(evidenceDir, 'request.json')
    const request = scenario.request
    const url = new URL(request.path, target)
    if (url.origin !== new URL(target).origin) return this.blocked(scenario, 'API request must stay within the configured target origin')
    writeFileSync(requestPath, JSON.stringify(redactRequest({ method: request.method, url: url.toString(), headers: request.headers ?? {}, body: request.body }), null, 2), 'utf8')
    const args = ['--silent', '--show-error', '--proto', '=http,https', '--connect-timeout', '5', '--max-time', '30', '--output', responsePath, '--dump-header', responseHeadersPath, '--write-out', '%{http_code}', '--request', request.method]
    for (const [name, value] of Object.entries(request.headers ?? {})) args.push('--header', `${name}: ${value}`)
    if (request.body !== undefined) args.push('--data-raw', request.body)
    args.push(url.toString())
    const result = await this.runCurl(args, signal)
    const status = Number.parseInt(result.stdout.trim(), 10)
    const rawBody = existsSync(responsePath) ? readFileSync(responsePath, 'utf8') : ''
    const rawHeaders = existsSync(responseHeadersPath) ? readFileSync(responseHeadersPath, 'utf8') : ''
    const failures = evaluateResponse(request, rawBody, rawHeaders)
    if (rawHeaders) writeFileSync(responseHeadersPath, redactHeaders(rawHeaders), 'utf8')
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody)
        writeFileSync(responsePath, JSON.stringify(redactRequest(parsed), null, 2), 'utf8')
      } catch {}
    }
    const evidence = [
      { id: `${scenario.id}-request`, path: requestPath, capturedAt: new Date().toISOString(), adapter: 'curl' },
      { id: `${scenario.id}-response`, path: responsePath, capturedAt: new Date().toISOString(), adapter: 'curl' },
      { id: `${scenario.id}-response-headers`, path: responseHeadersPath, capturedAt: new Date().toISOString(), adapter: 'curl' },
    ]
    if (result.code !== 0 || !Number.isSafeInteger(status)) {
      return { scenarioId: scenario.id, required: scenario.required, status: 'INCONCLUSIVE', reason: result.stderr || 'curl failed before an HTTP response', evidence }
    }
    return {
      scenarioId: scenario.id,
      required: scenario.required,
      status: status === request.expectedStatus && failures.length === 0 ? 'PASSED' : 'FAILED',
      observedStatus: status,
      reason: status !== request.expectedStatus ? `Expected HTTP ${request.expectedStatus}; observed HTTP ${status}` : failures[0],
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
      const abort = () => { child.kill() }
      const finish = (code: number | null, error = stderr) => {
        signal?.removeEventListener('abort', abort)
        resolve({ code, stdout, stderr: error })
      }
      child.once('error', (error) => finish(null, error.message))
      child.once('close', (code) => finish(code))
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
  }
}

function evaluateResponse(request: QaScenario['request'] & {}, body: string, rawHeaders: string): string[] {
  const failures: string[] = []
  const headers = parseHeaders(rawHeaders)
  for (const [name, expected] of Object.entries(request.expectedHeaders ?? {})) {
    if (headers[name.toLowerCase()] !== expected) failures.push(`Expected header ${name} to equal ${JSON.stringify(expected)}`)
  }
  if (request.expectedBodyContains !== undefined && !body.includes(request.expectedBodyContains)) failures.push(`Expected response body to contain ${JSON.stringify(request.expectedBodyContains)}`)
  if (request.expectedJson !== undefined) {
    try {
      const actual = JSON.parse(body)
      const mismatch = findJsonMismatch(request.expectedJson, actual)
      if (mismatch) failures.push(`Expected JSON ${mismatch}`)
    } catch {
      failures.push('Expected response body to be valid JSON')
    }
  }
  return failures
}

function parseHeaders(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator > 0) result[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim()
  }
  return result
}

function findJsonMismatch(expected: unknown, actual: unknown, path = '$'): string | undefined {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return `${path} to be an array of length ${expected.length}`
    for (let index = 0; index < expected.length; index++) {
      const mismatch = findJsonMismatch(expected[index], actual[index], `${path}[${index}]`)
      if (mismatch) return mismatch
    }
    return undefined
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return `${path} to be an object`
    for (const [key, value] of Object.entries(expected)) {
      const mismatch = findJsonMismatch(value, (actual as Record<string, unknown>)[key], `${path}.${key}`)
      if (mismatch) return mismatch
    }
    return undefined
  }
  return Object.is(expected, actual) ? undefined : `${path} to equal ${JSON.stringify(expected)}; observed ${JSON.stringify(actual)}`
}

function redactRequest(value: unknown, key = ''): unknown {
  if (/(authorization|cookie|password|token|secret|api[-_]?key)/i.test(key)) return '[REDACTED]'
  if (typeof value === 'string' && key === 'body') {
    try { return redactRequest(JSON.parse(value)) } catch { return '[REDACTED]' }
  }
  if (Array.isArray(value)) return value.map((item) => redactRequest(item))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactRequest(item, name)]))
  return value
}

function redactHeaders(raw: string): string {
  return raw.split(/\r?\n/).map((line) => {
    const separator = line.indexOf(':')
    if (separator <= 0) return line
    const name = line.slice(0, separator).trim()
    if (/(authorization|cookie|set-cookie|token|secret|api[-_]?key)/i.test(name)) {
      return `${name}: [REDACTED]`
    }
    return line
  }).join('\r\n')
}
