import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type RequestListener, type Server } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QaService } from '../QaService'
import { QaRunStore } from '../QaRunStore'
import { QaVerdictPolicy } from '../QaVerdictPolicy'
import { CurlDriver } from '../CurlDriver'
import { PlaywrightDriver } from '../PlaywrightDriver'
import type { QaPlan } from '../types'

describe('QaService', () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-'))
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  it('persists a standalone plan with one required API scenario per criterion', () => {
    const service = new QaService(new QaRunStore(workspace))

    const plan = service.plan({
      planId: 'orders-api',
      target: 'http://127.0.0.1:3000',
      criteria: ['Create an order', 'Reject invalid quantity'],
      profile: 'api',
    })

    expect(plan.scenarios).toHaveLength(2)
    expect(plan.scenarios.every((scenario) => scenario.required)).toBe(true)
    expect(new QaRunStore(workspace).loadPlan('orders-api', 1)).toEqual(plan)
  })

  it('fails when an executed required API assertion does not match', async () => {
    const server = await startServer((request, response) => {
      response.statusCode = request.url === '/orders' ? 201 : 404
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ created: true }))
    })
    const service = new QaService(new QaRunStore(workspace))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP address')
    const plan: QaPlan = {
      schemaVersion: 1,
      id: 'orders-api',
      version: 1,
      target: `http://127.0.0.1:${address.port}`,
      profile: 'api',
      createdAt: '2026-09-11T00:00:00.000Z',
      criteria: ['Order endpoint responds with 200'],
      scenarios: [{
        id: 'order-read',
        criterionIds: ['criterion-1'],
        required: true,
        profile: 'api',
        request: { method: 'GET', path: '/orders', expectedStatus: 200 },
      }],
    }
    new QaRunStore(workspace).savePlan(plan)

    try {
      const run = await service.execute(plan)

      expect(run.verdict).toBe('FAIL')
      expect(run.results[0]).toMatchObject({ status: 'FAILED', observedStatus: 201 })
      expect(run.results[0].evidence[0].path).toContain('evidence')
    } finally {
      await stopServer(server)
    }
  })

  it('validates API response headers and JSON body instead of status alone', async () => {
    const server = await startServer((_request, response) => {
      response.statusCode = 201
      response.setHeader('content-type', 'application/json')
      response.setHeader('x-request-id', 'request-42')
      response.end(JSON.stringify({ created: false, id: 42 }))
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP address')
    const service = new QaService(new QaRunStore(workspace))
    const plan = {
      schemaVersion: 1 as const,
      id: 'api-contract', version: 1, target: `http://127.0.0.1:${address.port}`, profile: 'api' as const,
      createdAt: '2026-09-11T00:00:00.000Z', criteria: ['Order is created'],
      scenarios: [{
        id: 'create-order', criterionIds: ['criterion-1'], required: true, profile: 'api' as const,
        request: {
          method: 'POST', path: '/orders', expectedStatus: 201,
          headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
          body: JSON.stringify({ password: 'secret-password' }),
          expectedHeaders: { 'x-request-id': 'request-42' },
          expectedJson: { created: true },
        },
      }],
    }

    try {
      const run = await service.execute(plan)
      const requestEvidence = readFileSync(run.results[0].evidence[0].path, 'utf8')

      expect(run.results[0]).toMatchObject({ status: 'FAILED', reason: expect.stringContaining('created') })
      expect(requestEvidence).not.toContain('secret-token')
      expect(requestEvidence).not.toContain('secret-password')
      expect(requestEvidence).toContain('[REDACTED]')
    } finally {
      await stopServer(server)
    }
  })

  it('blocks API requests that escape the configured target origin', async () => {
    const service = new QaService(new QaRunStore(workspace), [], async () => ({ available: true }))
    const plan = {
      schemaVersion: 1 as const, id: 'origin-boundary', version: 1,
      target: 'http://127.0.0.1:3000', profile: 'api' as const, createdAt: '2026-09-11T00:00:00.000Z',
      criteria: ['Stay within target'],
      scenarios: [{ id: 'escape', criterionIds: ['criterion-1'], required: true, profile: 'api' as const,
        request: { method: 'GET', path: 'https://example.com/admin', expectedStatus: 200 } }],
    }
    const apiDriver = new CurlDriver()
    const boundedService = new QaService(new QaRunStore(workspace), [apiDriver], async () => ({ available: true }))

    const run = await boundedService.execute(plan)

    expect(run.results[0]).toMatchObject({ status: 'BLOCKED', reason: expect.stringContaining('target origin') })
  })

  it('probes an unavailable target once and blocks every scenario without invoking drivers', async () => {
    const execute = vi.fn()
    const probe = vi.fn(async () => ({ available: false, reason: 'Target unavailable: connection refused' }))
    const service = new QaService(new QaRunStore(workspace), [{
      profile: 'web-game',
      doctor: async () => ({ available: true }),
      execute,
    }], probe)
    const plan: QaPlan = {
      schemaVersion: 1,
      id: 'offline-game',
      version: 1,
      target: 'http://127.0.0.1:3000',
      profile: 'web-game',
      createdAt: '2026-09-11T00:00:00.000Z',
      criteria: ['Game loads', 'Game starts'],
      scenarios: [
        { id: 'load', criterionIds: ['criterion-1'], required: true, profile: 'web-game', actions: [{ type: 'wait', value: '1' }] },
        { id: 'start', criterionIds: ['criterion-2'], required: true, profile: 'web-game', actions: [{ type: 'click', selector: '[data-start]' }] },
      ],
    }

    const run = await service.execute(plan)

    expect(probe).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
    expect(run.verdict).toBe('BLOCKED')
    expect(run.results).toEqual([
      expect.objectContaining({ scenarioId: 'load', status: 'BLOCKED', reason: 'Target unavailable: connection refused' }),
      expect.objectContaining({ scenarioId: 'start', status: 'BLOCKED', reason: 'Target unavailable: connection refused' }),
    ])
  })

  it('redacts sensitive headers and response body fields in persisted curl evidence', async () => {
    const server = await startServer((_request, response) => {
      response.statusCode = 200
      response.setHeader('content-type', 'application/json')
      response.setHeader('set-cookie', 'session_id=super-secret-cookie; Path=/')
      response.setHeader('authorization', 'Bearer sensitive-token')
      response.end(JSON.stringify({ token: 'jwt-super-secret', secret_key: 'topsecret', username: 'alice' }))
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP address')
    const service = new QaService(new QaRunStore(workspace))
    const plan: QaPlan = {
      schemaVersion: 1,
      id: 'api-redaction',
      version: 1,
      target: `http://127.0.0.1:${address.port}`,
      profile: 'api',
      createdAt: '2026-09-11T00:00:00.000Z',
      criteria: ['Endpoint responds with 200'],
      scenarios: [{
        id: 'sensitive-auth',
        criterionIds: ['criterion-1'],
        required: true,
        profile: 'api',
        request: { method: 'GET', path: '/login', expectedStatus: 200 },
      }],
    }

    try {
      const run = await service.execute(plan)
      expect(run.verdict).toBe('PASS')
      const evidenceDir = new QaRunStore(workspace).evidenceDir(run.id, 'sensitive-auth')
      const headersContent = readFileSync(join(evidenceDir, 'response.headers'), 'utf8')
      const bodyContent = readFileSync(join(evidenceDir, 'response.body'), 'utf8')
      expect(headersContent).not.toContain('super-secret-cookie')
      expect(headersContent).not.toContain('sensitive-token')
      expect(headersContent).toContain('[REDACTED]')
      expect(bodyContent).not.toContain('jwt-super-secret')
      expect(bodyContent).not.toContain('topsecret')
      expect(bodyContent).toContain('"username": "alice"')
    } finally {
      await stopServer(server)
    }
  })
})

describe('QaVerdictPolicy', () => {
  it('never returns PASS when a required scenario has no evidence', () => {
    expect(QaVerdictPolicy.evaluate([{ required: true, status: 'PASSED', evidence: [] }])).toBe('INCONCLUSIVE')
  })

  it('returns BLOCKED when a required scenario could not execute', () => {
    expect(QaVerdictPolicy.evaluate([{ required: true, status: 'BLOCKED', evidence: [] }])).toBe('BLOCKED')
  })
})

describe('PlaywrightDriver', () => {
  it('fails a scenario when a browser page error follows a user action', async () => {
    let pageErrorHandler: ((error: Error) => void) | undefined
    const page = {
      on: (event: string, handler: (error: Error) => void) => { if (event === 'pageerror') pageErrorHandler = handler },
      goto: async () => undefined,
      locator: () => ({ click: async () => pageErrorHandler?.(new Error('Illegal invocation')) }),
      keyboard: { press: async () => undefined },
      screenshot: async () => undefined,
    }
    const driver = new PlaywrightDriver('web-game', async () => ({
      chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) },
    }))

    const result = await driver.execute({
      id: 'start-game', criterionIds: ['criterion-1'], required: true, profile: 'web-game',
      actions: [{ type: 'click', selector: '[data-start]' }],
    }, 'http://127.0.0.1:4173', join(tmpdir(), `hrns-qa-browser-${Date.now()}`))

    expect(result).toMatchObject({ status: 'FAILED', reason: 'Browser page error: Illegal invocation' })
    expect(result.evidence).toHaveLength(2)
  })

  it('fails when an observable browser assertion does not match', async () => {
    const page = {
      on: () => undefined,
      goto: async () => undefined,
      locator: () => ({
        isVisible: async () => true,
        textContent: async () => 'Stopped',
      }),
      keyboard: { press: async () => undefined },
      waitForTimeout: async () => undefined,
      screenshot: async () => undefined,
    }
    const driver = new PlaywrightDriver('web', async () => ({
      chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) },
    }))

    const result = await driver.execute({
      id: 'status', criterionIds: ['criterion-1'], required: true, profile: 'web', actions: [{ type: 'wait', value: '1' }],
      assertions: [{ type: 'text', selector: '[data-status]', value: 'Running' }],
    } as any, 'http://127.0.0.1:3000', join(tmpdir(), `hrns-qa-browser-assert-${Date.now()}`))

    expect(result).toMatchObject({ status: 'FAILED', reason: expect.stringContaining('Expected text') })
    expect(result.evidence.map((item) => item.id)).toContain('status-observations')
  })

  it('resizes viewport and repeats keyboard input from a normalized plan', async () => {
    const setViewportSize = vi.fn(async () => undefined)
    const press = vi.fn(async () => undefined)
    const page = {
      on: () => undefined,
      goto: async () => undefined,
      setViewportSize,
      keyboard: { press },
      screenshot: async () => undefined,
      locator: () => ({ isVisible: async () => true }),
    }
    const driver = new PlaywrightDriver('web-game', async () => ({
      chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) },
    }))

    const result = await driver.execute({
      id: 'responsive-game', criterionIds: ['criterion-1'], required: true, profile: 'web-game',
      actions: [{ type: 'resize', width: 320, height: 800 }, { type: 'press', value: 'ArrowDown', count: 3 }],
      assertions: [{ type: 'visible', selector: '[data-board]' }],
    }, 'http://127.0.0.1:3000', join(tmpdir(), `hrns-qa-browser-${Date.now()}`))

    expect(result.status).toBe('PASSED')
    expect(setViewportSize).toHaveBeenCalledWith({ width: 320, height: 800 })
    expect(press).toHaveBeenCalledTimes(3)
    expect(press).toHaveBeenCalledWith('ArrowDown')
  })

  it('aborts Playwright action execution when signal is cancelled', async () => {
    const controller = new AbortController()
    controller.abort(new Error('User cancelled QA execution'))
    const page = {
      on: () => undefined,
      goto: async () => undefined,
      locator: () => ({ isVisible: async () => true }),
      waitForTimeout: vi.fn(async () => undefined),
      screenshot: async () => undefined,
    }
    const driver = new PlaywrightDriver('web', async () => ({
      chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) },
    }))

    const result = await driver.execute({
      id: 'aborted-test',
      criterionIds: ['criterion-1'],
      required: true,
      profile: 'web',
      actions: [{ type: 'wait', value: '10000' }],
      assertions: [{ type: 'visible', selector: '#app' }],
    }, 'http://127.0.0.1:3000', join(tmpdir(), `hrns-qa-browser-abort-${Date.now()}`), controller.signal)

    expect(result.status).toBe('BLOCKED')
    expect(result.reason).toContain('cancelled')
    expect(page.waitForTimeout).not.toHaveBeenCalled()
  })
})

function startServer(listener: RequestListener): Promise<Server> {
  const server = createServer(listener)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
