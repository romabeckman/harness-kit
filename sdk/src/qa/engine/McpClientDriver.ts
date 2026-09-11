import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { QaDriver, QaEvidence, QaScenario, QaScenarioResult } from '../types'

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export class McpClientDriver implements QaDriver {
  readonly profile = 'mcp' as const

  constructor(private readonly request: Fetcher = fetch) {}

  async doctor(): Promise<{ available: boolean }> {
    return { available: typeof this.request === 'function' }
  }

  async execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal): Promise<QaScenarioResult> {
    if (!scenario.mcp) return blocked(scenario, 'MCP scenario has no JSON-RPC request')
    let evidence: QaEvidence[] = []
    try {
      const targetUrl = new URL(target)
      if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') return blocked(scenario, 'MCP target must use HTTP or HTTPS')
      mkdirSync(evidenceDir, { recursive: true })
      const payload = { jsonrpc: '2.0', id: 1, method: scenario.mcp.method, params: scenario.mcp.params ?? {} }
      const response = await this.request(targetUrl.toString(), {
        method: 'POST', signal,
        headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const raw = await response.text()
      const requestPath = join(evidenceDir, 'request.json')
      const responsePath = join(evidenceDir, 'response.json')
      writeFileSync(requestPath, JSON.stringify(redact(payload), null, 2), 'utf8')
      writeFileSync(responsePath, redactText(raw), 'utf8')
      const capturedEvidence: QaEvidence[] = [
        { id: `${scenario.id}-mcp-request`, path: requestPath, capturedAt: new Date().toISOString(), adapter: 'mcp' },
        { id: `${scenario.id}-mcp-response`, path: responsePath, capturedAt: new Date().toISOString(), adapter: 'mcp' },
      ]
      evidence = capturedEvidence
      if (!response.ok) return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', observedStatus: response.status, reason: `MCP HTTP ${response.status}`, evidence }
      const parsed = parseMcpResponse(raw)
      if (isRecord(parsed) && isRecord(parsed.error)) return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: typeof parsed.error.message === 'string' ? parsed.error.message : 'MCP protocol error', evidence }
      const result = isRecord(parsed) ? parsed.result : undefined
      if (isRecord(result) && result.isError === true) return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: mcpErrorMessage(result), evidence }
      const expected = scenario.mcp.expectedResultContains
      const serializedResult = JSON.stringify(result) ?? ''
      if (expected && !serializedResult.includes(expected)) return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: `MCP result does not contain ${JSON.stringify(expected)}`, evidence }
      return { scenarioId: scenario.id, required: scenario.required, status: 'PASSED', evidence }
    } catch (error) {
      return blocked(scenario, error instanceof Error ? error.message : 'MCP request failed', evidence)
    }
  }
}

function blocked(scenario: QaScenario, reason: string, evidence: QaEvidence[] = []): QaScenarioResult {
  return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason, evidence }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(token|secret|password|authorization|cookie|api[-_]?key)/i.test(key) ? '[REDACTED]' : redact(item)]))
}

function redactText(value: string): string {
  try { return JSON.stringify(redact(parseMcpResponse(value)), null, 2) } catch { return value }
}

function parseMcpResponse(value: string): unknown {
  const lines = value.split(/\r?\n/)
  const isEventStream = lines.some((line) => line.startsWith('event:') || line.startsWith('data:'))
  if (!isEventStream) return JSON.parse(value)

  for (const event of value.split(/\r?\n\r?\n/)) {
    const dataLines = event.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
    if (dataLines.length > 0) return JSON.parse(dataLines.join('\n'))
  }
  throw new Error('MCP event stream contained no JSON data')
}

function mcpErrorMessage(result: Record<string, unknown>): string {
  if (Array.isArray(result.content)) {
    const messages = result.content.flatMap((item) => isRecord(item) && typeof item.text === 'string' ? [item.text] : [])
    if (messages.length > 0) return messages.join('\n')
  }
  return 'MCP tool returned an error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
