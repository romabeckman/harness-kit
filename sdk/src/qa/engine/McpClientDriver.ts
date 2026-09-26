import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { QaDriver, QaDriverExecutionContext, QaEvidence, QaScenario, QaScenarioResult } from '../types'
import { redactSecrets } from './QaAuthRedaction'

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>
const MCP_PROTOCOL_VERSION = '2025-11-25'
const MCP_MODERN_PROTOCOL_VERSION = '2026-07-28'
const MCP_CLIENT_INFO = { name: 'harness-kit-qa', version: '0.9.3' }
const MAX_MCP_EXECUTION_MS = 30_000

export class McpClientDriver implements QaDriver {
  readonly profile = 'mcp' as const

  constructor(private readonly request: Fetcher = fetch) {}

  async doctor(): Promise<{ available: boolean }> {
    return { available: typeof this.request === 'function' }
  }

  async execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal, context?: QaDriverExecutionContext): Promise<QaScenarioResult> {
    if (!scenario.mcp) return blocked(scenario, 'MCP scenario has no JSON-RPC request')
    let evidence: QaEvidence[] = []
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason ?? new Error('MCP request cancelled'))
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => controller.abort(new Error(`MCP request exceeded ${MAX_MCP_EXECUTION_MS} ms deadline`)), MAX_MCP_EXECUTION_MS)
    try {
      if (controller.signal.aborted) throw controller.signal.reason
      const targetUrl = new URL(target)
      if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') return blocked(scenario, 'MCP target must use HTTP or HTTPS')
      mkdirSync(evidenceDir, { recursive: true })
      const headers: Record<string, string> = { ...(context?.auth.headers ?? {}), accept: 'application/json, text/event-stream', 'content-type': 'application/json' }
      const initializePayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: MCP_CLIENT_INFO,
        },
      }
      const initializeResult = await requestWithOriginBoundRedirects(this.request, targetUrl.toString(), {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify(initializePayload),
      }, targetUrl.origin)
      if ('blockedReason' in initializeResult) return blocked(scenario, initializeResult.blockedReason, [], context?.auth)

      const initializeResponse = initializeResult.response
      let useModernProtocol = false
      let followUpHeaders = headers
      let sessionId: string | null = null
      if (!initializeResponse.ok) {
        if ([400, 404, 405].includes(initializeResponse.status)) {
          useModernProtocol = true
        } else {
          return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', observedStatus: initializeResponse.status, reason: `MCP HTTP ${initializeResponse.status} during initialization`, evidence }
        }
      } else {
        const initializeRead = await readMcpResponse(initializeResponse, initializePayload.id, controller.signal)
        const initializeParsed = initializeRead.value
        if (isModernInitializationUnsupported(initializeParsed)) {
          useModernProtocol = true
        } else if (isRecord(initializeParsed) && isRecord(initializeParsed.error)) {
          const message = typeof initializeParsed.error.message === 'string' ? initializeParsed.error.message : 'MCP protocol error'
          return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: redactSecrets(`MCP initialization failed: ${message}`, context?.auth), evidence }
        } else {
          const initializeValue = isRecord(initializeParsed) ? initializeParsed.result : undefined
          if (!isRecord(initializeValue) || typeof initializeValue.protocolVersion !== 'string') {
            return blocked(scenario, 'MCP initialize response did not include a negotiated protocol version', evidence, context?.auth)
          }

          sessionId = initializeResponse.headers.get('mcp-session-id')
          followUpHeaders = {
            ...headers,
            'MCP-Protocol-Version': initializeValue.protocolVersion,
            ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
          }
          const initializedPayload = { jsonrpc: '2.0', method: 'notifications/initialized' }
          const initializedResult = await requestWithOriginBoundRedirects(this.request, targetUrl.toString(), {
            method: 'POST',
            signal: controller.signal,
            headers: followUpHeaders,
            body: JSON.stringify(initializedPayload),
          }, targetUrl.origin)
          if ('blockedReason' in initializedResult) return blocked(scenario, initializedResult.blockedReason, evidence, context?.auth)
          if (!initializedResult.response.ok) {
            return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', observedStatus: initializedResult.response.status, reason: `MCP HTTP ${initializedResult.response.status} after initialization`, evidence }
          }
        }
      }

      const scenarioParams = scenario.mcp.params ?? {}
      const payload = {
        jsonrpc: '2.0',
        id: useModernProtocol ? 1 : 2,
        method: scenario.mcp.method,
        params: useModernProtocol ? addModernMetadata(scenarioParams) : scenarioParams,
      }
      if (useModernProtocol) followUpHeaders = modernRequestHeaders(headers, scenario.mcp.method, scenarioParams)
      const responseResult = await requestWithOriginBoundRedirects(this.request, targetUrl.toString(), {
        method: 'POST', signal: controller.signal,
        headers: followUpHeaders,
        body: JSON.stringify(payload),
      }, targetUrl.origin)
      if ('blockedReason' in responseResult) return blocked(scenario, responseResult.blockedReason, [], context?.auth)
      const response = responseResult.response
      const responseRead = await readMcpResponse(response, payload.id, controller.signal)
      const raw = responseRead.raw
      const requestPath = join(evidenceDir, 'request.json')
      const responsePath = join(evidenceDir, 'response.json')
      writeFileSync(requestPath, JSON.stringify(redact(payload, context?.auth), null, 2), 'utf8')
      writeFileSync(responsePath, redactText(raw, context?.auth), 'utf8')
      const capturedEvidence: QaEvidence[] = [
        { id: `${scenario.id}-mcp-request`, path: requestPath, capturedAt: new Date().toISOString(), adapter: 'mcp' },
        { id: `${scenario.id}-mcp-response`, path: responsePath, capturedAt: new Date().toISOString(), adapter: 'mcp' },
      ]
      evidence = capturedEvidence
      if (!response.ok) return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', observedStatus: response.status, reason: `MCP HTTP ${response.status}`, evidence }
      const parsed = responseRead.value
      const expected = scenario.mcp
      if (isRecord(parsed) && isRecord(parsed.error)) {
        if (expected.expectedIsError !== true) {
          return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: redactSecrets(typeof parsed.error.message === 'string' ? parsed.error.message : 'MCP protocol error', context?.auth), evidence }
        }
        if (expected.expectedResultContains && !containsMcpText({ error: parsed.error }, expected.expectedResultContains)) {
          return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: redactSecrets(`MCP result does not contain ${JSON.stringify(expected.expectedResultContains)}`, context?.auth), evidence }
        }
        return { scenarioId: scenario.id, required: scenario.required, status: 'PASSED', evidence }
      }
      const result = isRecord(parsed) ? parsed.result : undefined
      if (!isRecord(result)) return blocked(scenario, 'MCP response contained neither result nor protocol error', evidence)
      const actualIsError = result.isError === true
      if (expected.expectedIsError !== undefined && actualIsError !== expected.expectedIsError) {
        return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: redactSecrets(`MCP result isError was ${actualIsError}, expected ${expected.expectedIsError}`, context?.auth), evidence }
      }
      const structuredContent = isRecord(result.structuredContent) ? result.structuredContent : undefined
      if (expected.expectedState !== undefined && structuredContent?.state !== expected.expectedState) {
        return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: redactSecrets(`MCP result state was ${JSON.stringify(structuredContent?.state)}, expected ${JSON.stringify(expected.expectedState)}`, context?.auth), evidence }
      }
      if (expected.expectedReasonCode !== undefined && structuredContent?.reason_code !== expected.expectedReasonCode) {
        return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: redactSecrets(`MCP result reason_code was ${JSON.stringify(structuredContent?.reason_code)}, expected ${JSON.stringify(expected.expectedReasonCode)}`, context?.auth), evidence }
      }
      if (actualIsError && expected.expectedIsError !== true) return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: redactSecrets(mcpErrorMessage(result), context?.auth), evidence }
      if (expected.expectedResultContains && !containsMcpText(result, expected.expectedResultContains)) return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: redactSecrets(`MCP result does not contain ${JSON.stringify(expected.expectedResultContains)}`, context?.auth), evidence }
      return { scenarioId: scenario.id, required: scenario.required, status: 'PASSED', evidence }
    } catch (error) {
      return blocked(scenario, error instanceof Error ? error.message : 'MCP request failed', evidence, context?.auth)
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }
}

type McpRequestResult = { response: Response } | { blockedReason: string }

async function requestWithOriginBoundRedirects(
  request: Fetcher,
  target: string,
  init: RequestInit,
  origin: string,
): Promise<McpRequestResult> {
  let current = target
  const visited = new Set([current])
  for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
    const response = await request(current, { ...init, redirect: 'manual' })
    if (response.status < 300 || response.status >= 400) return { response }
    const location = response.headers.get('location')
    if (!location) return { response }
    const next = new URL(location, current)
    if (next.origin !== origin) return { blockedReason: 'MCP redirect leaves the configured target origin' }
    current = next.toString()
    if (visited.has(current)) return { blockedReason: 'MCP redirect loop detected' }
    visited.add(current)
  }
  return { blockedReason: 'MCP redirect limit exceeded' }
}

function blocked(scenario: QaScenario, reason: string, evidence: QaEvidence[] = [], auth?: QaDriverExecutionContext['auth']): QaScenarioResult {
  return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason: redactSecrets(reason, auth), evidence }
}

function redact(value: unknown, auth?: QaDriverExecutionContext['auth']): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item, auth))
  if (typeof value === 'string') return redactSecrets(value, auth)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(token|secret|password|authorization|cookie|api[-_]?key)/i.test(key) ? '[REDACTED]' : redact(item, auth)]))
}

function redactText(value: string, auth?: QaDriverExecutionContext['auth']): string {
  if (/^(?:event|data):/m.test(value)) return JSON.stringify(redact(parseMcpEvents(value), auth), null, 2)
  try { return JSON.stringify(redact(JSON.parse(value), auth), null, 2) } catch { return redactSecrets(value, auth) }
}

function parseMcpEvents(value: string): unknown[] {
  return value.split(/\r?\n\r?\n/).flatMap((event) => {
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
    if (data.length === 0) return []
    try { return [JSON.parse(data.join('\n'))] } catch { return [] }
  })
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

interface McpResponseRead { value: unknown; raw: string }

async function readMcpResponse(response: Response, requestId: number, signal?: AbortSignal): Promise<McpResponseRead> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('text/event-stream')) {
    const raw = await response.text()
    try {
      const value = parseMcpResponse(raw)
      return { value: isMatchingJsonRpcResponse(value, requestId) ? value : undefined, raw }
    } catch {
      return { value: undefined, raw }
    }
  }

  const reader = response.body?.getReader()
  if (!reader) return { value: undefined, raw: '' }
  const cancelReader = () => { void reader.cancel(signal?.reason).catch(() => undefined) }
  signal?.addEventListener('abort', cancelReader, { once: true })
  const decoder = new TextDecoder()
  let buffer = ''
  let raw = ''
  try {
    while (true) {
      signal?.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) {
        buffer += decoder.decode()
        break
      }
      const text = decoder.decode(chunk.value, { stream: true })
      raw += text
      buffer += text
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const value = eventPayload(frame)
        if (isMatchingJsonRpcResponse(value, requestId)) {
          await reader.cancel()
          return { value, raw }
        }
      }
    }
    const finalValue = eventPayload(buffer)
    return { value: isMatchingJsonRpcResponse(finalValue, requestId) ? finalValue : undefined, raw }
  } finally {
    signal?.removeEventListener('abort', cancelReader)
    reader.releaseLock()
  }
}

function eventPayload(frame: string): unknown {
  const data = frame.split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
  if (data.length === 0) return undefined
  try { return JSON.parse(data.join('\n')) } catch { return undefined }
}

function isMatchingJsonRpcResponse(value: unknown, requestId: number): value is Record<string, unknown> {
  return isRecord(value) && value.id === requestId && (isRecord(value.result) || isRecord(value.error))
}

function mcpErrorMessage(result: Record<string, unknown>): string {
  if (Array.isArray(result.content)) {
    const messages = result.content.flatMap((item) => isRecord(item) && typeof item.text === 'string' ? [item.text] : [])
    if (messages.length > 0) return messages.join('\n')
  }
  return 'MCP tool returned an error'
}

function containsMcpText(result: Record<string, unknown>, expected: string): boolean {
  const searchable = JSON.stringify({
    structuredContent: result.structuredContent,
    content: result.content,
    error: result.error,
  }) ?? ''
  return searchable.toLowerCase().includes(expected.toLowerCase())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isModernInitializationUnsupported(value: unknown): boolean {
  return isRecord(value) && isRecord(value.error) && value.error.code === -32601
}

function addModernMetadata(params: Record<string, unknown>): Record<string, unknown> {
  const existingMeta = isRecord(params._meta) ? params._meta : {}
  return {
    ...params,
    _meta: {
      ...existingMeta,
      'io.modelcontextprotocol/protocolVersion': MCP_MODERN_PROTOCOL_VERSION,
      'io.modelcontextprotocol/clientInfo': MCP_CLIENT_INFO,
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  }
}

function modernRequestHeaders(
  headers: Record<string, string>,
  method: string,
  params: Record<string, unknown>,
): Record<string, string> {
  return {
    ...headers,
    'MCP-Protocol-Version': MCP_MODERN_PROTOCOL_VERSION,
    'Mcp-Method': method,
    ...(method === 'tools/call' && typeof params.name === 'string' ? { 'Mcp-Name': params.name } : {}),
  }
}
