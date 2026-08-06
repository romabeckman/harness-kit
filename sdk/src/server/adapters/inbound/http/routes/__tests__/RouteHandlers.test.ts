import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import { RouteHandlers } from '../RouteHandlers'
import { InMemoryJobStore } from '../../../../outbound/repository/InMemoryJobStore'
import { JobQueue } from '../../../../outbound/queue/JobQueue'
import { WorkspaceLockManager } from '../../../../outbound/mutex/WorkspaceLockManager'

class MockIncomingMessage extends EventEmitter {
  public url: string
  public method: string
  public headers: Record<string, string> = {}

  constructor(url: string, method = 'GET') {
    super()
    this.url = url
    this.method = method
  }
}

class MockServerResponse {
  public statusCode = 200
  public headers: Record<string, string | number> = {}
  public body = ''

  writeHead(statusCode: number, headers?: Record<string, string | number>) {
    this.statusCode = statusCode
    if (headers) {
      this.headers = { ...this.headers, ...headers }
    }
  }

  end(data?: string) {
    if (data) this.body = data
  }
}

describe('RouteHandlers Integration Tests', () => {
  let jobStore: InMemoryJobStore
  let jobQueue: JobQueue
  let lockManager: WorkspaceLockManager
  let routeHandlers: RouteHandlers
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: process.cwd(),
    })

    jobStore = new InMemoryJobStore()
    jobQueue = new JobQueue()
    lockManager = new WorkspaceLockManager()
    routeHandlers = new RouteHandlers(jobStore, jobQueue, lockManager)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('IT-2.2.1 & FT-3.1: POST /orchestrator/run -> 202 Accepted with jobId and statusUrl', async () => {
    const req = new MockIncomingMessage('/orchestrator/run', 'POST')
    const res = new MockServerResponse()

    const handlePromise = routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    const jsonBody = JSON.stringify({ scope: 'build-api', project: 'backend', agent: 'claude-cli', mode: 'fast' })

    req.emit('data', Buffer.from(jsonBody))
    req.emit('end')

    await handlePromise

    expect(res.statusCode).toBe(202)
    const parsed = JSON.parse(res.body)
    expect(parsed.jobId).toBeDefined()
    expect(parsed.status).toBe('queued')
    expect(parsed.statusUrl).toContain(parsed.jobId)
  })

  it('Rejects POST /orchestrator/run when agent parameter is missing', async () => {
    const req = new MockIncomingMessage('/orchestrator/run', 'POST')
    const res = new MockServerResponse()

    const handlePromise = routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    req.emit('data', Buffer.from(JSON.stringify({ scope: 'test', project: 'backend' })))
    req.emit('end')
    await handlePromise

    expect(res.statusCode).toBe(400)
    const parsed = JSON.parse(res.body)
    expect(parsed.code).toBe('MISSING_AGENT_PARAMETER')
  })

  it('Rejects POST /orchestrator/run when agent parameter is invalid', async () => {
    const req = new MockIncomingMessage('/orchestrator/run', 'POST')
    const res = new MockServerResponse()

    const handlePromise = routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    req.emit('data', Buffer.from(JSON.stringify({ scope: 'test', project: 'backend', agent: 'invalid-agent' })))
    req.emit('end')
    await handlePromise

    expect(res.statusCode).toBe(400)
    const parsed = JSON.parse(res.body)
    expect(parsed.code).toBe('INVALID_AGENT')
  })

  it('IT-2.2.2: GET /orchestrator/status/:id -> 200 OK', async () => {
    const reqRun = new MockIncomingMessage('/orchestrator/run', 'POST')
    const resRun = new MockServerResponse()

    const runPromise = routeHandlers.handleRequest(reqRun as unknown as IncomingMessage, resRun as unknown as ServerResponse)
    reqRun.emit('data', Buffer.from(JSON.stringify({ scope: 'status-test', project: 'backend', agent: 'claude-cli' })))
    reqRun.emit('end')
    await runPromise

    const runParsed = JSON.parse(resRun.body)
    const jobId = runParsed.jobId

    const reqStatus = new MockIncomingMessage(`/orchestrator/status/${jobId}`, 'GET')
    const resStatus = new MockServerResponse()

    await routeHandlers.handleRequest(reqStatus as unknown as IncomingMessage, resStatus as unknown as ServerResponse)

    expect(resStatus.statusCode).toBe(200)
    const statusParsed = JSON.parse(resStatus.body)
    expect(statusParsed.jobId).toBe(jobId)
    expect(statusParsed.status).toBe('queued')
  })

  it('GET /orchestrator/settings?project=backend&agent=claude-cli -> 200 OK with model settings', async () => {
    const req = new MockIncomingMessage('/orchestrator/settings?project=backend&agent=claude-cli', 'GET')
    const res = new MockServerResponse()

    await routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)

    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(res.body)
    expect(parsed.project).toBe('backend')
    expect(parsed.agent).toBe('claude-cli')
    expect(parsed.projectPath).toBeDefined()
    expect(parsed.settings).toBeDefined()
  })

  it('POST /orchestrator/settings -> 200 OK creating/updating settings', async () => {
    const req = new MockIncomingMessage('/orchestrator/settings', 'POST')
    const res = new MockServerResponse()

    const handlePromise = routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    const jsonBody = JSON.stringify({
      project: 'backend',
      agent: 'claude-cli',
      settings: {
        'claude-cli': { timeoutMs: 45000 },
      },
    })

    req.emit('data', Buffer.from(jsonBody))
    req.emit('end')
    await handlePromise

    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(res.body)
    expect(parsed.settings['claude-cli']?.timeoutMs).toBe(45000)
  })

  it('IT-2.2.3: GET /health -> 200 OK', async () => {
    const req = new MockIncomingMessage('/health', 'GET')
    const res = new MockServerResponse()

    await routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)

    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(res.body)
    expect(parsed.status).toBe('healthy')
    expect(parsed.memoryUsage).toBeDefined()
  })

  it('IT-2.2.4: GET /docs -> 200 OK HTML', async () => {
    const req = new MockIncomingMessage('/docs', 'GET')
    const res = new MockServerResponse()

    await routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<!DOCTYPE html>')
    expect(res.body).toContain('swagger-ui')
  })

  it('FT-3.2.1: Rejects refine: true with HTTP 400', async () => {
    const req = new MockIncomingMessage('/orchestrator/run', 'POST')
    const res = new MockServerResponse()

    const handlePromise = routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    req.emit('data', Buffer.from(JSON.stringify({ scope: 'refine-test', project: 'backend', agent: 'claude-cli', refine: true })))
    req.emit('end')
    await handlePromise

    expect(res.statusCode).toBe(400)
    const parsed = JSON.parse(res.body)
    expect(parsed.code).toBe('REFINE_NOT_SUPPORTED_IN_HTTP_MODE')
  })

  it('FT-3.2.2: Rejects mode: "deep_thinking" with HTTP 400', async () => {
    const req = new MockIncomingMessage('/orchestrator/run', 'POST')
    const res = new MockServerResponse()

    const handlePromise = routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    req.emit('data', Buffer.from(JSON.stringify({ scope: 'deep-test', project: 'backend', agent: 'claude-cli', mode: 'deep_thinking' })))
    req.emit('end')
    await handlePromise

    expect(res.statusCode).toBe(400)
    const parsed = JSON.parse(res.body)
    expect(parsed.code).toBe('INTERACTIVE_MODE_NOT_ALLOWED')
  })

  it('FT-3.2.3: Returns HTTP 404 for unknown job ID', async () => {
    const req = new MockIncomingMessage('/orchestrator/status/non-existent-uuid', 'GET')
    const res = new MockServerResponse()

    await routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)

    expect(res.statusCode).toBe(404)
    const parsed = JSON.parse(res.body)
    expect(parsed.code).toBe('JOB_NOT_FOUND')
  })

  it('FT-3.3.1: Rejects path traversal with HTTP 400', async () => {
    const req = new MockIncomingMessage('/orchestrator/run', 'POST')
    const res = new MockServerResponse()

    const handlePromise = routeHandlers.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    req.emit('data', Buffer.from(JSON.stringify({ scope: 'traversal-test', agent: 'claude-cli', projectPaths: ['../secret'] })))
    req.emit('end')
    await handlePromise

    expect(res.statusCode).toBe(400)
    const parsed = JSON.parse(res.body)
    expect(parsed.code).toBe('PATH_TRAVERSAL_DETECTED')
  })
})
