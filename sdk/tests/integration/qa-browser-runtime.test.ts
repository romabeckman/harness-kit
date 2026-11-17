import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, type RequestListener, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlaywrightDriver } from '../../src/qa/engine/PlaywrightDriver'
import type { QaDriverExecutionContext, QaScenario } from '../../src/qa/types'

// Use installed browsers only; this suite never downloads a browser or contacts an external target.
const executablePath = [chromium.executablePath(), ...(process.platform === 'win32' ? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
] : [])].find((candidate) => existsSync(candidate))

describe.skipIf(!executablePath)('QA browser runtime boundaries', () => {
  let workspace: string
  let driver: PlaywrightDriver
  let servers: Server[]

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-browser-runtime-'))
    servers = []
    driver = new PlaywrightDriver('web', async () => ({ chromium: { launch: (options) => chromium.launch({ ...options, executablePath }) } }))
    await driver.startRun('runtime', 'http://127.0.0.1')
  })
  afterEach(async () => {
    await driver?.finishRun('runtime')
    await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))))
    rmSync(workspace, { recursive: true, force: true })
  })

  async function serve(handler: RequestListener): Promise<string> {
    const server = createServer(handler)
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP server')
    return `http://127.0.0.1:${address.port}`
  }

  it('keeps API keys out of cross-origin redirect hops', async () => {
    const received: Array<string | undefined> = []
    const foreign = await serve((request, response) => { received.push(request.headers['x-api-key'] as string | undefined); response.end('<body>Destination</body>') })
    const target = await serve((_request, response) => { response.writeHead(302, { location: foreign + '/collect' }); response.end() })

    await driver.execute(scenario(), target, join(workspace, 'redirect'), undefined, authenticated())

    expect(received.length).toBeGreaterThan(0)
    expect(received).not.toContain('synthetic-key')
  })

  it('preserves authentication and browser URLs across same-origin redirects', async () => {
    const received: Array<string | undefined> = []
    const target = await serve((request, response) => {
      received.push(request.headers['x-api-key'] as string | undefined)
      if (request.url === '/start') { response.writeHead(302, { location: '/ready' }); response.end(); return }
      response.setHeader('content-type', 'text/html')
      response.end(request.headers['x-api-key'] === 'synthetic-key' ? '<body>Authenticated</body>' : '<body>Anonymous</body>')
    })

    const result = await driver.execute({ ...scenario(), assertions: [{ type: 'text', selector: 'body', value: 'Authenticated' }, { type: 'url', value: target + '/ready' }] }, target + '/start', workspace, undefined, authenticated())

    expect(result.status).toBe('PASSED')
    expect(received.slice(0, 2)).toEqual(['synthetic-key', 'synthetic-key'])
  })

  it('fails a text assertion when its element only appears after the assertion deadline', async () => {
    const target = await serve((_request, response) => {
      response.setHeader('content-type', 'text/html')
      response.end('<body><script>setTimeout(() => { document.body.innerHTML += `<p id="late">Ready</p>` }, 4500)</script></body>')
    })

    const result = await driver.execute({ ...scenario(), assertions: [{ type: 'text', selector: '#late', value: 'Ready' }] }, target, workspace, undefined, anonymous())

    expect(result.status).toBe('FAILED')
    expect(result.evidence.length).toBeGreaterThan(0)
  }, 10_000)

  it('cancels a fixed browser wait without waiting for its full duration', async () => {
    const target = await serve((_request, response) => { response.end('<body>Ready</body>') })
    const controller = new AbortController()
    const started = Date.now()
    const execution = driver.execute({ ...scenario(), actions: [{ type: 'wait', value: '1500' }] }, target, workspace, controller.signal, anonymous())
    const timer = setTimeout(() => controller.abort(new Error('QA cancelled')), 300)
    try {
      expect(await execution).toMatchObject({ status: 'BLOCKED', reason: 'QA cancelled' })
      expect(Date.now() - started).toBeLessThan(1200)
    } finally { clearTimeout(timer) }
  })
})

function scenario(): QaScenario {
  return { id: '001-runtime', criterionIds: ['criterion-1'], required: true, profile: 'web', actions: [], assertions: [{ type: 'visible', selector: 'body' }] }
}
function authenticated(): QaDriverExecutionContext {
  return { runId: 'runtime', auth: { mode: 'api-key', profile: 'synthetic', headers: { 'X-API-Key': 'synthetic-key' }, environment: {} } }
}
function anonymous(): QaDriverExecutionContext {
  return { runId: 'runtime', auth: { mode: 'none', profile: 'none', headers: {}, environment: {} } }
}
