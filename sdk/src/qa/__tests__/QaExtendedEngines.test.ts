import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AccessibilityDriver,
  CliDriver,
  McpClientDriver,
  MobileWebDriver,
  PlaywrightDriver,
  WebSocketDriver,
} from '../engine'
import type { QaScenario } from '../types'
import { QaPlanningPhase } from '../phases/QaPlanningPhase'

describe('extended QA engines', () => {
  let evidenceDir: string

  beforeEach(() => {
    evidenceDir = mkdtempSync(join(tmpdir(), 'hrns-qa-engine-'))
  })

  afterEach(() => rmSync(evidenceDir, { recursive: true, force: true }))

  it('calls an MCP tool over Streamable HTTP and verifies its result', async () => {
    const request = mcpSessionRequest(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'healthy' }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const driver = new McpClientDriver(request)

    const result = await driver.execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'health', arguments: {} }, expectedResultContains: 'healthy' },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(request).toHaveBeenCalledWith(MCP_TARGET, expect.objectContaining({ method: 'POST' }))
    expect(readFileSync(result.evidence[0].path, 'utf8')).toContain('tools/call')
  })

  it('initializes an MCP session before listing tools and sends the session ID on follow-up requests', async () => {
    const request = vi.fn(async (_input: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { id?: number; method: string }
      if (payload.method === 'initialize') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: payload.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'qa-test-server', version: '1.0.0' },
          },
        }), { status: 200, headers: { 'content-type': 'application/json', 'Mcp-Session-Id': 'qa-session-1' } })
      }
      if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 })
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { tools: [{ name: 'search_entities' }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/list', params: {} },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(request.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
    ])
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'harness-kit-qa', version: '0.9.2' },
      },
    })
    expect(request).toHaveBeenNthCalledWith(2, MCP_TARGET, expect.objectContaining({
      headers: expect.objectContaining({
        'Mcp-Session-Id': 'qa-session-1',
        'MCP-Protocol-Version': '2025-11-25',
      }),
    }))
    expect(request).toHaveBeenNthCalledWith(3, MCP_TARGET, expect.objectContaining({
      headers: expect.objectContaining({
        'Mcp-Session-Id': 'qa-session-1',
        'MCP-Protocol-Version': '2025-11-25',
      }),
    }))
  })

  it('uses stateless MCP requests when the server rejects legacy initialization', async () => {
    const request = vi.fn(async (_input: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { id?: number; method: string }
      if (payload.method === 'initialize') {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: payload.id,
          error: { code: -32601, message: 'Method not found' },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { content: [{ type: 'text', text: 'healthy' }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'health', arguments: {} }, expectedResultContains: 'healthy' },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(request.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).method)).toEqual(['initialize', 'tools/call'])
    const [, modernInit] = request.mock.calls[1]
    expect(modernInit?.headers).toEqual(expect.objectContaining({
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'health',
    }))
    expect(JSON.parse(String(modernInit?.body))).toMatchObject({
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'harness-kit-qa', version: '0.9.2' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    })
  })

  it('matches MCP textual result assertions without case sensitivity', async () => {
    const request = mcpSessionRequest(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, result: { structuredContent: { matches: [{ label: 'ALPHA MODEL' }] } },
    }), { status: 200 }))
    const driver = new McpClientDriver(request)

    const result = await driver.execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'catalog_search', arguments: { query: 'Alpha' } }, expectedResultContains: 'Alpha' },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
  })

  it('parses MCP Streamable HTTP SSE frames with an event prefix', async () => {
    const request = mcpSessionRequest(new Response([
      'event: message',
      'data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"healthy"}]}}',
      '',
    ].join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } }))

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'health', arguments: {} }, expectedResultContains: 'healthy' },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(result.evidence).toHaveLength(2)
  })

  it('ignores MCP notifications and selects the matching JSON-RPC response from SSE', async () => {
    const request = vi.fn(async (_input: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { id?: number; method: string }
      if (payload.method === 'initialize') return new Response(JSON.stringify({
        jsonrpc: '2.0', id: payload.id,
        result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'fixture', version: '1' } },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
      if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 })
      return new Response([
        'event: message',
        'data: {"jsonrpc":"2.0","method":"notifications/message","params":{"message":"Working"}}',
        '',
        'event: message',
        `data: ${JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { content: [{ type: 'text', text: 'healthy' }] } })}`,
        '',
      ].join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    })

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'health' }, expectedResultContains: 'healthy' },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
    const responseEvidence = readFileSync(result.evidence[1].path, 'utf8')
    expect(responseEvidence).toContain('Working')
    expect(responseEvidence).toContain('healthy')
  })

  it('matches fragmented SSE responses by request ID and cancels a still-open stream', async () => {
    let streamCancelled = false
    const request = vi.fn(async (_input: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { id?: number; method: string }
      if (payload.method === 'initialize') return new Response(JSON.stringify({
        jsonrpc: '2.0', id: payload.id,
        result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'fixture', version: '1' } },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
      if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 })

      const events = [
        'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/message","params":{"message":"Working"}}\n\n',
        'event: message\ndata: {"jsonrpc":"2.0","id":99,"result":{"content":[{"type":"text","text":"wrong"}]}}\n\n',
        `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { content: [{ type: 'text', text: 'healthy' }] } })}\n\n`,
      ].join('')
      const bytes = new TextEncoder().encode(events)
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let offset = 0; offset < bytes.length; offset += 11) controller.enqueue(bytes.slice(offset, offset + 11))
        },
        cancel() { streamCancelled = true },
      })
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    })

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'health' }, expectedResultContains: 'healthy' },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(streamCancelled).toBe(true)
    expect(readFileSync(result.evidence[1].path, 'utf8')).toContain('healthy')
    expect(readFileSync(result.evidence[1].path, 'utf8')).toContain('Working')
    expect(readFileSync(result.evidence[1].path, 'utf8')).toContain('wrong')
  }, 2_000)

  it('waits for an asynchronous browser assertion to become true', async () => {
    const textContent = vi.fn()
      .mockResolvedValueOnce('Pending')
      .mockResolvedValueOnce('Pending')
      .mockResolvedValueOnce('Saved')
    const page = fakePage()
    page.locator = vi.fn(() => ({ click: vi.fn().mockResolvedValue(undefined), textContent, isVisible: vi.fn().mockResolvedValue(true) }))
    const driver = new PlaywrightDriver('web', async () => ({
      chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) },
    }))

    const result = await driver.execute(scenario('web', {
      actions: [{ type: 'click', selector: '#save' }],
      assertions: [{ type: 'text', selector: '#status', value: 'Saved' }],
    }), 'http://127.0.0.1:3000', evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(textContent).toHaveBeenCalledTimes(3)
  })

  it('waits for asynchronous visibility, URL, count, and attribute observations', async () => {
    const cases = [
      { name: 'visibility', type: 'visible', selector: '#ready', value: undefined, count: undefined, values: [false, false, true] },
      { name: 'URL', type: 'url', selector: undefined, value: 'http://127.0.0.1:3000/ready', count: undefined, values: ['http://127.0.0.1:3000/', 'http://127.0.0.1:3000/', 'http://127.0.0.1:3000/ready'] },
      { name: 'count', type: 'count', selector: '.row', value: undefined, count: 2, values: [0, 0, 2] },
      { name: 'attribute', type: 'attribute', selector: '#ready', value: 'true', attribute: 'data-ready', count: undefined, values: [null, null, 'true'] },
    ]

    for (const testCase of cases) {
      const values = [...testCase.values]
      const observe = vi.fn(() => values.shift())
      const page = fakePage()
      page.url = observe
      page.locator = vi.fn(() => ({
        isVisible: observe, textContent: observe, count: observe, getAttribute: observe,
      }))
      const driver = new PlaywrightDriver('web', async () => ({
        chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) },
      }))
      const assertion = {
        type: testCase.type,
        ...(testCase.selector ? { selector: testCase.selector } : {}),
        ...(testCase.value !== undefined ? { value: testCase.value } : {}),
        ...(testCase.count !== undefined ? { count: testCase.count } : {}),
        ...('attribute' in testCase ? { attribute: testCase.attribute } : {}),
      }

      const result = await driver.execute(scenario('web', { actions: [], assertions: [assertion as any] }), 'http://127.0.0.1:3000', evidenceDir)

      expect(result.status, testCase.name).toBe('PASSED')
      expect(observe).toHaveBeenCalledTimes(3)
    }
  })

  it('fails after the bounded assertion wait with the last observed text', async () => {
    const textContent = vi.fn().mockResolvedValue('Pending')
    const page = fakePage()
    page.locator = vi.fn(() => ({ textContent }))
    const driver = new PlaywrightDriver('web', async () => ({
      chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) },
    }))

    const result = await driver.execute(scenario('web', {
      actions: [], assertions: [{ type: 'text', selector: '#status', value: 'Saved' }],
    }), 'http://127.0.0.1:3000', evidenceDir)

    expect(result.status).toBe('FAILED')
    expect(result.reason).toContain('observed "Pending"')
    expect(textContent.mock.calls.length).toBeGreaterThan(1)
  }, 5_000)

  it('resolves same-origin relative browser navigation before execution', async () => {
    const page = fakePage()
    const goto = vi.fn().mockResolvedValue(undefined)
    page.goto = goto
    const driver = new PlaywrightDriver('web', async () => ({
      chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) },
    }))

    const result = await driver.execute(scenario('web', {
      actions: [{ type: 'navigate', value: '/next' }],
      assertions: [{ type: 'visible', selector: 'body' }],
    }), 'http://127.0.0.1:3000', evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(goto).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:3000/next', expect.anything())
  })

  it('does not execute a CLI command after its signal was aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('QA cancelled'))
    const executor = vi.fn().mockResolvedValue({ code: 0, stdout: 'done', stderr: '' })

    const result = await new CliDriver(executor).execute(scenario('cli', {
      cli: { command: 'node', expectedExitCode: 0 },
    }), evidenceDir, evidenceDir, controller.signal)

    expect(result.status).toBe('BLOCKED')
    expect(executor).not.toHaveBeenCalled()
  })

  it('classifies an in-flight CLI cancellation as blocked', async () => {
    const controller = new AbortController()
    const executor = vi.fn((_command: string, _args: string[], _cwd: string, signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const pending = new CliDriver(executor).execute(scenario('cli', {
      cli: { command: 'node', expectedExitCode: 0 },
    }), evidenceDir, evidenceDir, controller.signal)

    expect(executor).toHaveBeenCalledOnce()
    controller.abort(new Error('QA cancelled'))

    await expect(pending).resolves.toMatchObject({ status: 'BLOCKED', reason: 'QA cancelled' })
  })

  it('fails MCP protocol errors without treating them as infrastructure errors', async () => {
    const request = mcpSessionRequest(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Unknown tool' },
    }), { status: 200 }))

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'missing' } },
    }), MCP_TARGET, evidenceDir)

    expect(result).toMatchObject({ status: 'FAILED', reason: expect.stringContaining('Unknown tool') })
  })

  it('fails MCP tool errors returned inside the result envelope', async () => {
    const request = mcpSessionRequest(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, result: {
        isError: true,
        content: [{ type: 'text', text: 'Unknown tool' }],
      },
    }), { status: 200 }))

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'missing' } },
    }), MCP_TARGET, evidenceDir)

    expect(result).toMatchObject({ status: 'FAILED', reason: 'Unknown tool', evidence: expect.any(Array) })
    expect(result.evidence).toHaveLength(2)
  })

  it('accepts an expected MCP tool error when the plan declares it', async () => {
    const request = mcpSessionRequest(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, result: {
        isError: true,
        content: [{ type: 'text', text: 'Unknown tool' }],
        structuredContent: { state: 'integration-error', reason_code: 'unknown_tool' },
      },
    }), { status: 200 }))

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: {
        method: 'tools/call',
        params: { name: 'missing' },
        expectedResultContains: 'Unknown tool',
        expectedState: 'integration-error',
        expectedReasonCode: 'unknown_tool',
        expectedIsError: true,
      },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
  })

  it('does not match MCP envelope metadata as result content', async () => {
    const request = mcpSessionRequest(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, result: {
        isError: false,
        content: [{ type: 'text', text: 'No matching record' }],
        structuredContent: { state: 'empty', reason_code: 'no_match' },
      },
    }), { status: 200 }))

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'lookup' }, expectedResultContains: 'error' },
    }), MCP_TARGET, evidenceDir)

    expect(result).toMatchObject({ status: 'FAILED', reason: 'MCP result does not contain "error"' })
  })

  it('checks structured MCP state and reason without requiring an error envelope', async () => {
    const request = mcpSessionRequest(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, result: {
        isError: false,
        content: [{ type: 'text', text: 'No matching record' }],
        structuredContent: { state: 'empty', reason_code: 'no_match' },
      },
    }), { status: 200 }))

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: {
        method: 'tools/call',
        params: { name: 'lookup' },
        expectedState: 'empty',
        expectedReasonCode: 'no_match',
      },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
  })

  it('retains captured evidence when MCP response parsing fails', async () => {
    const request = mcpSessionRequest(new Response('event: message\ndata: not-json\n\n', { status: 200 }))

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'health' } },
    }), MCP_TARGET, evidenceDir)

    expect(result).toMatchObject({ status: 'BLOCKED', reason: expect.stringContaining('MCP response contained neither result nor protocol error') })
    expect(result.evidence).toHaveLength(2)
  })

  it('executes a bounded CLI command and validates output', async () => {
    const execute = vi.fn().mockResolvedValue({ code: 0, stdout: 'version 1.2.3', stderr: '' })
    const driver = new CliDriver(execute)

    const result = await driver.execute(scenario('cli', {
      cli: { command: 'hrns', args: ['--version'], expectedExitCode: 0, expectedStdoutContains: '1.2.3' },
    }), process.cwd(), evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(execute).toHaveBeenCalledWith('hrns', ['--version'], process.cwd(), undefined)
  })

  it('blocks CLI shell syntax and absolute executable paths', async () => {
    const execute = vi.fn()
    const result = await new CliDriver(execute).execute(scenario('cli', {
      cli: { command: '/bin/sh', args: ['-c', 'echo unsafe'], expectedExitCode: 0 },
    }), process.cwd(), evidenceDir)

    expect(result).toMatchObject({ status: 'BLOCKED', reason: expect.stringContaining('safe executable name') })
    expect(execute).not.toHaveBeenCalled()
  })

  it('runs mobile web scenarios with touch and mobile viewport defaults', async () => {
    const newPage = vi.fn().mockResolvedValue(fakePage())
    const loader = async () => ({ chromium: { launch: async () => ({ newPage, close: async () => undefined }) } })
    const driver = new MobileWebDriver(loader)

    const result = await driver.execute(scenario('mobile-web', {
      actions: [{ type: 'navigate', value: 'http://127.0.0.1:3000' }],
      assertions: [{ type: 'visible', selector: 'main' }],
    }), 'http://127.0.0.1:3000', evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(newPage).toHaveBeenCalledWith(expect.objectContaining({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } }))
  })

  it('fails accessibility scenarios when deterministic audits find violations', async () => {
    const page = fakePage()
    page.evaluate = vi.fn().mockResolvedValue([{ rule: 'image-alt', selector: 'img' }])
    const loader = async () => ({ chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) } })

    const result = await new AccessibilityDriver(loader).execute(scenario('accessibility'), 'http://127.0.0.1:3000', evidenceDir)

    expect(result).toMatchObject({ status: 'FAILED', reason: expect.stringContaining('image-alt') })
    expect(existsSync(result.evidence[0].path)).toBe(true)
  })

  it('exchanges WebSocket messages and validates received payloads', async () => {
    const exchange = vi.fn().mockResolvedValue(['ready', '{"ok":true}'])
    const driver = new WebSocketDriver(exchange)

    const result = await driver.execute(scenario('websocket', {
      websocket: { messages: ['ping'], expectedMessages: ['ready', '"ok":true'] },
    }), 'ws://127.0.0.1:3000/events', evidenceDir)

    expect(result.status).toBe('PASSED')
    expect(exchange).toHaveBeenCalledWith('ws://127.0.0.1:3000/events', ['ping'], undefined, ['ready', '"ok":true'])
  })

  it('waits for every expected WebSocket response instead of closing on a short idle gap', async () => {
    class DelayedWebSocket {
      private readonly listeners = new Map<string, Array<(event: any) => void>>()
      constructor(_url: string) { queueMicrotask(() => this.emit('open', {})) }
      addEventListener(name: string, listener: (event: any) => void) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]) }
      send(_message: string) {
        setTimeout(() => this.emit('message', { data: 'first' }), 0)
        setTimeout(() => this.emit('message', { data: 'second' }), 350)
      }
      close() { queueMicrotask(() => this.emit('close', {})) }
      private emit(name: string, event: any) { for (const listener of this.listeners.get(name) ?? []) listener(event) }
    }
    vi.stubGlobal('WebSocket', DelayedWebSocket)

    try {
      const result = await new WebSocketDriver().execute(scenario('websocket', {
        websocket: { messages: ['ping'], expectedMessages: ['first', 'second'] },
      }), 'ws://qa.test/events', evidenceDir)

      expect(result.status).toBe('PASSED')
      expect(readFileSync(result.evidence[0].path, 'utf8')).toContain('second')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('accepts CLI workspace targets and typed engine requests from agent plans', () => {
    const phase = new QaPlanningPhase()

    const cliPlan = phase.parse(JSON.stringify({
      id: 'cli-plan', target: '.', profile: 'cli', criteria: ['Version works'],
      scenarios: [{ id: 'version', criterionIds: ['criterion-1'], required: true, profile: 'cli', cli: { command: 'hrns', args: ['--version'], expectedExitCode: 0 } }],
    }), {}, 1)
    const mcpPlan = phase.parse(JSON.stringify({
      id: 'mcp-plan', target: 'http://127.0.0.1:3000/mcp', profile: 'mcp', criteria: ['Tool works'],
      scenarios: [{ id: 'tool', criterionIds: ['criterion-1'], required: true, profile: 'mcp', mcp: { method: 'tools/call', params: { name: 'health' }, expectedState: 'success', expectedReasonCode: 'ready', expectedIsError: false } }],
    }), {}, 1)

    expect(cliPlan.scenarios[0].cli?.command).toBe('hrns')
    expect(mcpPlan.scenarios[0].mcp?.method).toBe('tools/call')
    expect(mcpPlan.scenarios[0].mcp?.expectedState).toBe('success')
    expect(mcpPlan.scenarios[0].mcp?.expectedReasonCode).toBe('ready')
    expect(mcpPlan.scenarios[0].mcp?.expectedIsError).toBe(false)
  })
})

const MCP_TARGET = 'https://qa.test/mcp'

function mcpSessionRequest(toolResponse: Response) {
  return vi.fn(async (_input: string, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { id?: number; method: string }
    if (payload.method === 'initialize') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: payload.id,
        result: {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'qa-test-server', version: '1.0.0' },
        },
      }), { status: 200, headers: { 'content-type': 'application/json', 'Mcp-Session-Id': 'qa-session-1' } })
    }
    if (payload.method === 'notifications/initialized') return new Response(null, { status: 202 })
    const headers = new Headers(toolResponse.headers)
    let body = await toolResponse.clone().text()
    try {
      const data = JSON.parse(body)
      if (data && typeof data === 'object' && 'id' in data) data.id = payload.id
      body = JSON.stringify(data)
    } catch {
      if (headers.get('content-type')?.includes('text/event-stream')) {
        body = body.replace(/(\"id\"\s*:\s*)\d+/g, `$1${payload.id}`)
      }
    }
    return new Response(body, { status: toolResponse.status, headers })
  })
}

function scenario(profile: QaScenario['profile'], values: Partial<QaScenario> = {}): QaScenario {
  return { id: `${profile}-scenario`, criterionIds: ['criterion-1'], required: true, profile, ...values }
}

function fakePage(): any {
  return {
    on: vi.fn(),
    goto: vi.fn(),
    locator: vi.fn(() => ({ isVisible: vi.fn().mockResolvedValue(true) })),
    screenshot: vi.fn(async ({ path }: { path: string }) => { await import('node:fs').then(({ writeFileSync }) => writeFileSync(path, 'image')) }),
    evaluate: vi.fn().mockResolvedValue([]),
  }
}
