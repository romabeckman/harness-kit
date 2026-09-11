import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type RequestListener, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QaService } from '../QaService'
import { QaRunStore } from '../QaRunStore'
import { QaVerdictPolicy } from '../QaVerdictPolicy'
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
    expect(result.evidence).toHaveLength(1)
  })
})

function startServer(listener: RequestListener): Promise<Server> {
  const server = createServer(listener)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
