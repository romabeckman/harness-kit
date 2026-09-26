import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import spawn from 'cross-spawn'
import { CliDriver, CurlDriver, McpClientDriver, PlaywrightDriver, WebSocketDriver } from '../engine'
import { redactSecrets } from '../engine/QaAuthRedaction'
import type { QaDriver, QaDriverExecutionContext, QaScenario } from '../types'

vi.mock('cross-spawn', () => ({ default: vi.fn() }))

describe('QA authentication engine security', () => {
  let workspace: string
  let curlConfigInput: ReturnType<typeof vi.fn>
  let curlResponseBody: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-auth-engine-'))
    curlConfigInput = vi.fn()
    curlResponseBody = '{}'
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), {
        stdin: { end: curlConfigInput },
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: vi.fn(),
      })
      queueMicrotask(() => {
        writeFileSync(args[args.indexOf('--output') + 1], curlResponseBody)
        writeFileSync(args[args.indexOf('--dump-header') + 1], 'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n')
        child.stdout.emit('data', Buffer.from('200'))
        child.emit('close', 0)
      })
      return child
    }) as unknown as typeof spawn)
  })

  afterEach(() => {
    vi.clearAllMocks()
    rmSync(workspace, { recursive: true, force: true })
  })

  it.each([
    ['basic', { mode: 'basic', profile: 'basic', headers: { Authorization: 'Basic dTpw' }, environment: {}, basic: { username: 'u', password: 'basic-secret' } }, 'basic-secret', 'Authorization: Basic dTpw'],
    ['bearer', { mode: 'bearer', profile: 'bearer', headers: { Authorization: 'Bearer bearer-secret' }, environment: {} }, 'bearer-secret', 'Authorization: Bearer bearer-secret'],
    ['api-key', { mode: 'api-key', profile: 'api-key', headers: { 'X-Client-Auth': 'api-key-secret' }, environment: {} }, 'api-key-secret', 'X-Client-Auth: api-key-secret'],
    ['cookie', { mode: 'cookie', profile: 'cookie', headers: { Cookie: 'session=cookie-secret' }, environment: {}, cookie: { name: 'session', value: 'cookie-secret' } }, 'cookie-secret', 'Cookie: session=cookie-secret'],
  ] as const)('keeps %s literal credentials out of curl arguments and evidence', async (_mode, auth, secret, header) => {
    const result = await new CurlDriver().execute(apiScenario(), 'http://qa.test', workspace, undefined, { auth })

    expect(result.status).toBe('PASSED')
    const args = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(args.join('\u0000')).not.toContain(secret)
    expect(curlConfigInput).toHaveBeenCalledWith(expect.stringContaining(header))
    expect(readFileSync(join(workspace, 'request.json'), 'utf8')).not.toContain(secret)
  })

  it('passes literal authentication headers to MCP without persisting them', async () => {
    const request = mcpSessionRequest(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'ok' }] } }), { status: 200 }))
    const context: QaDriverExecutionContext = { auth: { mode: 'bearer', profile: 'local', headers: { Authorization: 'Bearer mcp-secret' }, environment: {} } }

    const result = await new McpClientDriver(request).execute(mcpScenario(), 'https://qa.test/mcp', workspace, undefined, context)

    expect(result.status).toBe('PASSED')
    expect(request).toHaveBeenCalledWith('https://qa.test/mcp', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mcp-secret' }) }))
    expect(readFileSync(join(workspace, 'response.json'), 'utf8')).not.toContain('mcp-secret')
  })

  it('blocks MCP redirects that leave the configured target origin', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, {
      status: 307,
      headers: { location: 'https://evil.test/collect' },
    }))
    const context: QaDriverExecutionContext = { auth: { mode: 'api-key', profile: 'local', headers: { 'X-API-Key': 'redirect-secret' }, environment: {} } }

    const result = await new McpClientDriver(request).execute(mcpScenario(), 'https://qa.test/mcp', workspace, undefined, context)

    expect(result).toMatchObject({ status: 'BLOCKED', reason: expect.stringContaining('origin') })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('redacts authentication values from MCP protocol error reasons', async () => {
    const request = mcpSessionRequest(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32000, message: 'backend echoed redirect-secret' },
    }), { status: 200 }))
    const context: QaDriverExecutionContext = { auth: { mode: 'api-key', profile: 'local', headers: { 'X-API-Key': 'redirect-secret' }, environment: {} } }

    const result = await new McpClientDriver(request).execute(mcpScenario(), 'https://qa.test/mcp', workspace, undefined, context)

    expect(result.status).toBe('FAILED')
    expect(result.reason).not.toContain('redirect-secret')
  })

  it('redacts raw bearer tokens without requiring the Authorization prefix', () => {
    const auth: QaDriverExecutionContext['auth'] = { mode: 'bearer', profile: 'local', headers: { Authorization: 'Bearer raw-bearer-secret' }, environment: {} }

    expect(redactSecrets('server echoed raw-bearer-secret', auth)).toBe('server echoed [REDACTED]')
  })

  it('redacts literal auth values echoed in curl response evidence', async () => {
    curlResponseBody = JSON.stringify({ echo: 'echo-secret' })
    const context: QaDriverExecutionContext = { auth: { mode: 'api-key', profile: 'local', headers: { 'X-Client-Auth': 'echo-secret' }, environment: {} } }

    const result = await new CurlDriver().execute(apiScenario(), 'http://qa.test', workspace, undefined, context)

    expect(result.status).toBe('PASSED')
    expect(readFileSync(join(workspace, 'response.body'), 'utf8')).not.toContain('echo-secret')
    expect(readFileSync(join(workspace, 'response.body'), 'utf8')).toContain('[REDACTED]')
  })

  it('blocks authenticated CLI scenarios without explicit environment mappings', async () => {
    const executor = vi.fn()
    const context: QaDriverExecutionContext = { auth: { mode: 'bearer', profile: 'local', headers: { Authorization: 'Bearer cli-secret' }, environment: {} } }

    const result = await new CliDriver(executor).execute(cliScenario(), workspace, workspace, undefined, context)

    expect(result).toMatchObject({ status: 'BLOCKED', reason: expect.stringContaining('environment') })
    expect(executor).not.toHaveBeenCalled()
  })

  it('redacts mapped literal CLI secrets from captured output', async () => {
    const executor = vi.fn().mockResolvedValue({ code: 0, stdout: 'token=cli-secret', stderr: 'warning cli-secret' })
    const context: QaDriverExecutionContext = { auth: { mode: 'bearer', profile: 'local', headers: { Authorization: 'Bearer cli-secret' }, environment: { QA_TOKEN: 'cli-secret' } } }

    const result = await new CliDriver(executor).execute(cliScenario(), workspace, workspace, undefined, context)

    expect(result.status).toBe('PASSED')
    const evidence = readFileSync(join(workspace, 'cli.json'), 'utf8')
    expect(evidence).not.toContain('cli-secret')
    expect(evidence).toContain('[REDACTED]')
  })

  it.each(['ENOENT', 'EACCES'] as const)('blocks CLI execution when startup fails with %s', async (code) => {
    vi.mocked(spawn).mockImplementation(((_command: string) => {
      const child = Object.assign(new EventEmitter(), {
        stdin: { end: vi.fn() },
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: vi.fn(),
      })
      queueMicrotask(() => child.emit('error', Object.assign(new Error(`spawn ${code}`), { code })))
      return child
    }) as unknown as typeof spawn)

    const result = await new CliDriver().execute(cliScenario(), workspace, workspace)

    expect(result.status).toBe('BLOCKED')
    expect(result.reason).toContain(code)
  })

  it('stops the CLI process when cancellation races child listener registration', async () => {
    const controller = new AbortController()
    let child: EventEmitter & { stdin: { end: ReturnType<typeof vi.fn> }; stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> }
    vi.mocked(spawn).mockImplementation(((_command: string) => {
      child = Object.assign(new EventEmitter(), {
        stdin: { end: vi.fn() }, stdout: new EventEmitter(), stderr: new EventEmitter(),
        kill: vi.fn(() => child.emit('close', null)),
      })
      controller.abort(new Error('QA cancelled'))
      return child
    }) as unknown as typeof spawn)

    const result = await new CliDriver().execute(cliScenario(), workspace, workspace, controller.signal)

    expect(result).toMatchObject({ status: 'BLOCKED', reason: 'QA cancelled' })
    expect(child!.kill).toHaveBeenCalledOnce()
  })

  it('scopes literal Basic browser credentials to the target origin', async () => {
    const page = browserPage()
    const newPage = vi.fn().mockResolvedValue(page)
    const loader = async () => ({ chromium: { launch: async () => ({ newPage, close: async () => undefined }) } })
    const context: QaDriverExecutionContext = { auth: { mode: 'basic', profile: 'local', headers: { Authorization: 'Basic dTpw' }, environment: {}, basic: { username: 'u', password: 'browser-secret' } } }

    const result = await new PlaywrightDriver('web', loader).execute(browserScenario(), 'https://qa.test/app', workspace, undefined, context)

    expect(result.status).toBe('PASSED')
    expect(newPage).toHaveBeenCalledWith(expect.objectContaining({ httpCredentials: { username: 'u', password: 'browser-secret', origin: 'https://qa.test' } }))
  })

  it.each([
    ['bearer', { mode: 'bearer', profile: 'local', headers: { Authorization: 'Bearer browser-secret' }, environment: {} }, 'Authorization', 'Bearer browser-secret'],
    ['api-key', { mode: 'api-key', profile: 'local', headers: { 'X-Client-Auth': 'browser-secret' }, environment: {} }, 'X-Client-Auth', 'browser-secret'],
  ] as const)('injects literal %s headers only in same-origin browser requests', async (_mode, auth, header, value) => {
    const page = browserPage()
    const loader = async () => ({ chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) } })

    const result = await new PlaywrightDriver('web', loader).execute(browserScenario(), 'https://qa.test/app', workspace, undefined, { auth })

    expect(result.status).toBe('PASSED')
    expect(page.route).toHaveBeenCalled()
    expect(page.continueRoute).toHaveBeenCalledWith(expect.objectContaining({ headers: expect.objectContaining({ [header]: value }) }))
  })

  it('applies literal cookies through the browser context', async () => {
    const page = browserPage()
    const loader = async () => ({ chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) } })
    const context: QaDriverExecutionContext = { auth: { mode: 'cookie', profile: 'local', headers: { Cookie: 'session=browser-cookie' }, environment: {}, cookie: { name: 'session', value: 'browser-cookie' } } }

    const result = await new PlaywrightDriver('web', loader).execute(browserScenario(), 'https://qa.test/app', workspace, undefined, context)

    expect(result.status).toBe('PASSED')
    expect(page.addCookies).toHaveBeenCalledWith([{ name: 'session', value: 'browser-cookie', url: 'https://qa.test/app' }])
  })

  it('removes configured credentials when a browser request redirects off origin', async () => {
    const page = browserPage()
    let routeHandler: ((route: any) => Promise<void>) | undefined
    page.route.mockImplementation(async (_pattern: string, handler: (route: any) => Promise<void>) => { routeHandler = handler })
    const loader = async () => ({ chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) } })
    const auth: QaDriverExecutionContext['auth'] = { mode: 'bearer', profile: 'local', headers: { Authorization: 'Bearer browser-secret' }, environment: {} }

    const result = await new PlaywrightDriver('web', loader).execute(browserScenario(), 'https://qa.test/app', workspace, undefined, { auth })
    const sameOriginContinue = vi.fn()
    const redirectedOriginContinue = vi.fn()
    await routeHandler!({ request: () => ({ url: () => 'https://qa.test/api', headers: () => ({}) }), continue: sameOriginContinue })
    await routeHandler!({ request: () => ({ url: () => 'https://evil.test/collect', headers: () => ({ Authorization: 'Bearer browser-secret', accept: 'text/html' }) }), continue: redirectedOriginContinue })

    expect(result.status).toBe('PASSED')
    expect(sameOriginContinue).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer browser-secret' } })
    expect(redirectedOriginContinue).toHaveBeenCalledWith({ headers: { accept: 'text/html' } })
  })

  it('redacts configured credentials from browser assertion results and evidence', async () => {
    const page = browserPage()
    page.locator.mockReturnValue({ isVisible: vi.fn().mockResolvedValue(true), textContent: vi.fn().mockResolvedValue('browser-secret') })
    const loader = async () => ({ chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) } })
    const auth: QaDriverExecutionContext['auth'] = { mode: 'bearer', profile: 'local', headers: { Authorization: 'Bearer browser-secret' }, environment: {} }
    const scenario = { ...browserScenario(), assertions: [{ type: 'text' as const, selector: '#token', value: 'not the secret' }] }

    const result = await new PlaywrightDriver('web', loader).execute(scenario, 'https://qa.test/app', workspace, undefined, { auth })
    const observations = readFileSync(join(workspace, 'observations.json'), 'utf8')

    expect(result.status).toBe('FAILED')
    expect(result.reason).not.toContain('browser-secret')
    expect(observations).not.toContain('browser-secret')
  })

  it('redacts credentials from browser page errors, rejected actions, and setup failures', async () => {
    const auth: QaDriverExecutionContext['auth'] = { mode: 'bearer', profile: 'local', headers: { Authorization: 'Bearer browser-secret' }, environment: {} }
    const createDriver = (page: any, close = async () => undefined) => new PlaywrightDriver('web', async () => ({
      chromium: { launch: async () => ({ newPage: async () => page, close }) },
    }))

    const pageErrorPage = browserPage()
    let reportPageError: ((error: Error) => void) | undefined
    pageErrorPage.on.mockImplementation((event: string, listener: (error: Error) => void) => {
      if (event === 'pageerror') reportPageError = listener
    })
    pageErrorPage.goto.mockImplementation(async () => { reportPageError?.(new Error('page echoed browser-secret')) })
    const pageError = await createDriver(pageErrorPage).execute(browserScenario(), 'https://qa.test/app', join(workspace, 'page-error'), undefined, { auth })

    const actionErrorPage = browserPage()
    actionErrorPage.locator.mockImplementation(() => ({ click: vi.fn().mockRejectedValue(new Error('action echoed browser-secret')) }))
    const actionError = await createDriver(actionErrorPage).execute({
      ...browserScenario(), actions: [{ type: 'click', selector: '#submit' }],
    }, 'https://qa.test/app', join(workspace, 'action-error'), undefined, { auth })

    const setupError = await createDriver(browserPage(), async () => { throw new Error('close echoed browser-secret') })
      .execute(browserScenario(), 'https://qa.test/app', join(workspace, 'setup-error'), undefined, { auth })

    for (const result of [pageError, actionError, setupError]) {
      expect(result.status).not.toBe('PASSED')
      expect(result.reason).not.toContain('browser-secret')
      const artifacts = result.evidence.filter((item) => item.path.endsWith('.json')).map((item) => readFileSync(item.path, 'utf8')).join('\n')
      expect(artifacts).not.toContain('browser-secret')
    }
    expect(pageError.status).toBe('FAILED')
    expect(actionError.status).toBe('FAILED')
    expect(setupError.status).toBe('BLOCKED')
  })

  it('blocks authenticated WebSocket scenarios instead of running unauthenticated', async () => {
    const exchange = vi.fn()
    const driver: QaDriver = new WebSocketDriver(exchange)
    const context: QaDriverExecutionContext = { auth: { mode: 'bearer', profile: 'local', headers: { Authorization: 'Bearer socket-secret' }, environment: {} } }

    const result = await driver.execute({ id: 'socket', criterionIds: ['criterion-1'], required: true, profile: 'websocket', websocket: { messages: ['ping'], expectedMessages: [] } }, 'wss://qa.test/events', workspace, undefined, context)

    expect(result).toMatchObject({ status: 'BLOCKED', reason: expect.stringContaining('authentication') })
    expect(exchange).not.toHaveBeenCalled()
  })
})

function apiScenario(): QaScenario {
  return { id: 'api', criterionIds: ['criterion-1'], required: true, profile: 'api', request: { method: 'GET', path: '/', expectedStatus: 200 } }
}

function mcpScenario(): QaScenario {
  return { id: 'mcp', criterionIds: ['criterion-1'], required: true, profile: 'mcp', mcp: { method: 'tools/call', params: { name: 'health' }, expectedResultContains: 'ok' } }
}

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
    } catch { /* Preserve intentionally malformed protocol fixtures. */ }
    return new Response(body, { status: toolResponse.status, headers })
  })
}

function cliScenario(): QaScenario {
  return { id: 'cli', criterionIds: ['criterion-1'], required: true, profile: 'cli', cli: { command: 'hrns', expectedExitCode: 0 } }
}

function browserScenario(): QaScenario {
  return { id: 'browser', criterionIds: ['criterion-1'], required: true, profile: 'web', assertions: [{ type: 'visible', selector: 'main' }] }
}

function browserPage(): any {
  const addCookies = vi.fn()
  const continueRoute = vi.fn()
  const page: any = {
    addCookies,
    continueRoute,
    on: vi.fn(),
    goto: vi.fn(),
    locator: vi.fn(() => ({ isVisible: vi.fn().mockResolvedValue(true) })),
    screenshot: vi.fn(async ({ path }: { path: string }) => writeFileSync(path, 'image')),
    context: vi.fn(() => ({ addCookies })),
    route: vi.fn(async (_pattern: string, handler: (route: any) => Promise<void>) => handler({ request: () => ({ url: () => 'https://qa.test/api', headers: () => ({}) }), continue: continueRoute })),
  }
  return page
}
