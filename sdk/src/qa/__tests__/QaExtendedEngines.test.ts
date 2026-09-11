import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AccessibilityDriver,
  CliDriver,
  McpClientDriver,
  MobileWebDriver,
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
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
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

  it('matches MCP textual result assertions without case sensitivity', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, result: { structuredContent: { matches: [{ label: 'ALPHA MODEL' }] } },
    }), { status: 200 }))
    const driver = new McpClientDriver(request)

    const result = await driver.execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'catalog_search', arguments: { query: 'Alpha' } }, expectedResultContains: 'Alpha' },
    }), MCP_TARGET, evidenceDir)

    expect(result.status).toBe('PASSED')
  })

  it('parses MCP Streamable HTTP SSE frames with an event prefix', async () => {
    const request = vi.fn().mockResolvedValue(new Response([
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

  it('fails MCP protocol errors without treating them as infrastructure errors', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Unknown tool' },
    }), { status: 200 }))

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'missing' } },
    }), MCP_TARGET, evidenceDir)

    expect(result).toMatchObject({ status: 'FAILED', reason: expect.stringContaining('Unknown tool') })
  })

  it('fails MCP tool errors returned inside the result envelope', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
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
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
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
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
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
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
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
    const request = vi.fn().mockResolvedValue(new Response('event: message\ndata: not-json\n\n', { status: 200 }))

    const result = await new McpClientDriver(request).execute(scenario('mcp', {
      mcp: { method: 'tools/call', params: { name: 'health' } },
    }), MCP_TARGET, evidenceDir)

    expect(result).toMatchObject({ status: 'BLOCKED', reason: expect.stringContaining('Unexpected token') })
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
    expect(exchange).toHaveBeenCalledWith('ws://127.0.0.1:3000/events', ['ping'], undefined)
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
