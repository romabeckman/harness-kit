import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { QaDriver, QaDriverExecutionContext, QaScenario, QaScenarioResult } from '../types'

export type WebSocketExchange = (target: string, messages: string[], signal?: AbortSignal) => Promise<string[]>

export class WebSocketDriver implements QaDriver {
  readonly profile = 'websocket' as const

  constructor(private readonly exchange: WebSocketExchange = exchangeMessages) {}

  async doctor(): Promise<{ available: boolean; reason?: string }> {
    return typeof WebSocket === 'function' ? { available: true } : { available: false, reason: 'WebSocket is unavailable in this Node.js runtime' }
  }

  async execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal, context?: QaDriverExecutionContext): Promise<QaScenarioResult> {
    if (context?.auth.mode !== undefined && context.auth.mode !== 'none') return blocked(scenario, `WebSocket authentication profile "${context.auth.profile}" is unsupported by this driver`)
    const request = scenario.websocket
    if (!request) return blocked(scenario, 'WebSocket scenario has no message exchange')
    let url: URL
    try { url = new URL(target) } catch { return blocked(scenario, 'WebSocket target must be a URL') }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return blocked(scenario, 'WebSocket target must use ws or wss')
    try {
      const received = await this.exchange(url.toString(), request.messages, signal)
      mkdirSync(evidenceDir, { recursive: true })
      const evidencePath = join(evidenceDir, 'websocket.json')
      writeFileSync(evidencePath, JSON.stringify({ sent: request.messages, received }, null, 2), 'utf8')
      const evidence = [{ id: `${scenario.id}-websocket`, path: evidencePath, capturedAt: new Date().toISOString(), adapter: 'websocket' }]
      const missing = request.expectedMessages.find((expected) => !received.some((message) => message.includes(expected)))
      return { scenarioId: scenario.id, required: scenario.required, status: missing ? 'FAILED' : 'PASSED', reason: missing ? `No WebSocket message contains ${JSON.stringify(missing)}` : undefined, evidence }
    } catch (error) {
      return blocked(scenario, error instanceof Error ? error.message : 'WebSocket exchange failed')
    }
  }
}

function exchangeMessages(target: string, messages: string[], signal?: AbortSignal): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target)
    const received: string[] = []
    let idle: ReturnType<typeof setTimeout> | undefined
    const timeout = setTimeout(() => finish(new Error('WebSocket exchange timed out')), 5_000)
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      if (idle) clearTimeout(idle)
      signal?.removeEventListener('abort', abort)
      try { socket.close() } catch {}
      error ? reject(error) : resolve(received)
    }
    const abort = () => finish(signal?.reason instanceof Error ? signal.reason : new Error('WebSocket exchange cancelled'))
    signal?.addEventListener('abort', abort, { once: true })
    socket.addEventListener('open', () => {
      for (const message of messages) socket.send(message)
      if (messages.length === 0) idle = setTimeout(() => finish(), 250)
    })
    socket.addEventListener('message', (event) => {
      received.push(typeof event.data === 'string' ? event.data : String(event.data))
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => finish(), 250)
    })
    socket.addEventListener('error', () => finish(new Error('WebSocket connection failed')))
    socket.addEventListener('close', () => finish())
  })
}

function blocked(scenario: QaScenario, reason: string): QaScenarioResult {
  return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason, evidence: [] }
}
