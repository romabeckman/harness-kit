import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { RouteHandlers } from '../RouteHandlers'
import { InMemoryJobStore } from '../../repository/InMemoryJobStore'
import { JobQueue } from '../../queue/JobQueue'
import { WorkspaceLockManager } from '../../mutex/WorkspaceLockManager'

describe('RouteHandlers API Integration Tests', () => {
  let server: http.Server
  let jobStore: InMemoryJobStore
  let jobQueue: JobQueue
  let lockManager: WorkspaceLockManager
  let routeHandlers: RouteHandlers
  let baseUrl: string

  beforeEach(async () => {
    jobStore = new InMemoryJobStore()
    jobQueue = new JobQueue()
    lockManager = new WorkspaceLockManager()
    routeHandlers = new RouteHandlers(jobStore, jobQueue, lockManager)

    server = http.createServer((req, res) => {
      routeHandlers.handleRequest(req, res)
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })

  describe('IT-2.2.1: POST /orchestrator/run -> 202 Accepted', () => {
    it('creates and enqueues job and returns HTTP 202 Accepted with RunResponseDto', async () => {
      const res = await fetch(`${baseUrl}/orchestrator/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'test-run',
          mode: 'fast',
        }),
      })

      expect(res.status).toBe(202)
      const data = (await res.json()) as any
      expect(data.jobId).toBeDefined()
      expect(data.status).toBe('queued')
      expect(data.statusUrl).toBe(`/orchestrator/status/${data.jobId}`)
      expect(data.workspacePath).toBeDefined()

      const storedJob = await jobStore.findById(data.jobId)
      expect(storedJob).not.toBeNull()
      expect(storedJob?.status).toBe('queued')
      expect(jobQueue.size).toBe(1)
    })
  })

  describe('IT-2.2.2: GET /orchestrator/status/:id -> 200 OK', () => {
    it('returns HTTP 200 OK with JobStatusDto for existing job', async () => {
      const runRes = await fetch(`${baseUrl}/orchestrator/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'status-check' }),
      })
      const runData = (await runRes.json()) as any

      const statusRes = await fetch(`${baseUrl}/orchestrator/status/${runData.jobId}`)
      expect(statusRes.status).toBe(200)

      const statusData = (await statusRes.json()) as any
      expect(statusData.jobId).toBe(runData.jobId)
      expect(statusData.status).toBe('queued')
      expect(statusData.workspacePath).toBeDefined()
    })
  })

  describe('IT-2.2.3: GET /health -> 200 OK', () => {
    it('returns HTTP 200 OK with HealthStatusVo containing system metrics', async () => {
      const res = await fetch(`${baseUrl}/health`)
      expect(res.status).toBe(200)

      const health = (await res.json()) as any
      expect(health.status).toBe('healthy')
      expect(typeof health.uptimeSeconds).toBe('number')
      expect(health.timestamp).toBeDefined()
      expect(typeof health.activeJobs).toBe('number')
      expect(typeof health.queuedJobs).toBe('number')
      expect(health.memoryUsage).toBeDefined()
      expect(typeof health.memoryUsage.rssMb).toBe('number')
      expect(typeof health.memoryUsage.heapUsedMb).toBe('number')
    })
  })

  describe('IT-2.2.4: GET /docs -> 200 OK', () => {
    it('returns HTTP 200 OK text/html with Swagger UI document', async () => {
      const res = await fetch(`${baseUrl}/docs`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')

      const html = await res.text()
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('swagger-ui')
    })

    it('GET /docs/openapi.json returns HTTP 200 OK application/json with spec', async () => {
      const res = await fetch(`${baseUrl}/docs/openapi.json`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/json')

      const spec = (await res.json()) as any
      expect(spec.openapi).toBe('3.0.3')
      expect(spec.paths['/orchestrator/run']).toBeDefined()
    })
  })

  describe('FT-3.2.1: Rejects refine: true with HTTP 400', () => {
    it('returns HTTP 400 Bad Request when refine is true', async () => {
      const res = await fetch(`${baseUrl}/orchestrator/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'refine-test',
          refine: true,
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.code).toBe('REFINE_NOT_SUPPORTED_IN_HTTP_MODE')
    })
  })

  describe('FT-3.2.2: Rejects mode: "deep_thinking" with HTTP 400', () => {
    it('returns HTTP 400 Bad Request when mode is deep_thinking', async () => {
      const res = await fetch(`${baseUrl}/orchestrator/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'deep-thinking-test',
          mode: 'deep_thinking',
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.code).toBe('INTERACTIVE_MODE_NOT_ALLOWED')
    })
  })

  describe('FT-3.2.3: Returns HTTP 404 for unknown job ID', () => {
    it('returns HTTP 404 Not Found when requesting non-existent job ID', async () => {
      const res = await fetch(`${baseUrl}/orchestrator/status/non-existent-uuid-999`)
      expect(res.status).toBe(404)

      const data = (await res.json()) as any
      expect(data.code).toBe('JOB_NOT_FOUND')
    })
  })

  describe('FT-3.3.1: Rejects path traversal with HTTP 400', () => {
    it('returns HTTP 400 Bad Request when projectPaths contains path traversal', async () => {
      const res = await fetch(`${baseUrl}/orchestrator/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'traversal-test',
          projectPaths: ['../secret/etc/passwd'],
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.code).toBe('PATH_TRAVERSAL_DETECTED')
    })
  })
})
