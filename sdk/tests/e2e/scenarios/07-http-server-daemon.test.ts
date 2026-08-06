import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import spawn from 'cross-spawn'
import { HttpServer } from '../../../src/server/HttpServer'

/**
 * Helper to make real HTTP requests over TCP sockets.
 */
function makeHttpRequest(
  port: number,
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string; json: any }> {
  return new Promise((resolve, reject) => {
    const postData = body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    const reqHeaders: Record<string, string> = { ...headers }

    if (postData && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json'
    }
    if (postData) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(postData))
    }

    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let resBody = ''
        res.on('data', (chunk) => {
          resBody += chunk
        })
        res.on('end', () => {
          let parsedJson: any = null
          try {
            parsedJson = JSON.parse(resBody)
          } catch {}
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: resBody,
            json: parsedJson,
          })
        })
      }
    )

    req.on('error', reject)

    if (postData) {
      req.write(postData)
    }
    req.end()
  })
}

describe('E2E Scenario 07: HTTP Server Daemon Workflows & Security', () => {
  let server: HttpServer | undefined
  const tempDir = join(process.cwd(), 'tests', 'e2e', '.temp', 'http-server-e2e')
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.AUTH_MODE
    delete process.env.AUTH_BASIC_USER
    delete process.env.AUTH_BASIC_PASS
    delete process.env.AUTH_BEARER_TOKEN

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
    mkdirSync(tempDir, { recursive: true })

    // Initialize temporary Git repository
    spawn.sync('git', ['init'], { cwd: tempDir, stdio: 'pipe' })
    spawn.sync('git', ['config', 'user.name', 'E2E Test'], { cwd: tempDir, stdio: 'pipe' })
    spawn.sync('git', ['config', 'user.email', 'e2e@test.com'], { cwd: tempDir, stdio: 'pipe' })
  })

  afterEach(async () => {
    process.env = { ...originalEnv }
    if (server) {
      await server.stop()
      server = undefined
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('1. Server Startup, Port Binding & Health Check Probe (GET /health)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()
    expect(port).toBeGreaterThan(0)

    const res = await makeHttpRequest(port, '/health')
    expect(res.statusCode).toBe(200)
    expect(res.json.status).toBe('healthy')
    expect(res.json.activeJobs).toBe(0)
    expect(res.json.queuedJobs).toBe(0)
    expect(typeof res.json.uptimeSeconds).toBe('number')
    expect(res.json.memoryUsage).toBeDefined()
  })

  it('2. OpenAPI & Swagger UI Documentation Endpoints (GET /docs & GET /docs/openapi.json)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // Test Swagger UI HTML
    const docsRes = await makeHttpRequest(port, '/docs')
    expect(docsRes.statusCode).toBe(200)
    expect(docsRes.headers['content-type']).toContain('text/html')
    expect(docsRes.body).toContain('<!DOCTYPE html>')
    expect(docsRes.body).toContain('swagger-ui')

    // Test raw OpenAPI spec JSON
    const jsonRes = await makeHttpRequest(port, '/docs/openapi.json')
    expect(jsonRes.statusCode).toBe(200)
    expect(jsonRes.json.openapi).toBe('3.0.3')
    expect(jsonRes.json.paths['/orchestrator/run']).toBeDefined()
    expect(jsonRes.json.paths['/orchestrator/jobs/{id}/resume']).toBeDefined()
    expect(jsonRes.json.paths['/orchestrator/settings']).toBeDefined()
    expect(jsonRes.json.paths['/health']).toBeDefined()
  })

  it('3. Real Orchestration Job Execution Workflow (POST /orchestrator/run & GET /orchestrator/status/:id)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // 1. Enqueue Job
    const runRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      scope: 'e2e-http-run-test',
      projectPaths: [tempDir],
      mode: 'fast',
      useWorktree: true,
    })

    expect(runRes.statusCode).toBe(202)
    expect(runRes.json.jobId).toBeDefined()
    expect(runRes.json.status).toBe('queued')
    const jobId = runRes.json.jobId

    // 2. Poll Status
    const statusRes = await makeHttpRequest(port, `/orchestrator/status/${jobId}`)
    expect(statusRes.statusCode).toBe(200)
    expect(statusRes.json.jobId).toBe(jobId)
    expect(['queued', 'running', 'completed', 'failed']).toContain(statusRes.json.status)
  })

  it('4. Resuming Failed or Stopped Job (POST /orchestrator/jobs/:id/resume)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // Save previous failed job directly in store
    const jobStore = server.getJobStore()
    const previousJobId = 'e2e-failed-job-999'
    await jobStore.save({
      jobId: previousJobId,
      status: 'failed',
      workspacePath: tempDir,
      request: { scope: 'resume-scope-test', action: 'reset' },
      createdAt: new Date().toISOString(),
      error: { code: 'PREV_FAIL', message: 'Simulated failure' },
    })

    // Call Resume endpoint
    const resumeRes = await makeHttpRequest(
      port,
      `/orchestrator/jobs/${previousJobId}/resume`,
      'POST',
      { steeringMessage: 'resume with steering' }
    )

    expect(resumeRes.statusCode).toBe(202)
    expect(resumeRes.json.jobId).toBeDefined()
    expect(resumeRes.json.jobId).not.toBe(previousJobId)
    expect(resumeRes.json.status).toBe('queued')

    // Verify stored resumed job has action: 'resume'
    const newJob = await jobStore.findById(resumeRes.json.jobId)
    expect(newJob?.request.action).toBe('resume')
    expect(newJob?.request.steeringMessage).toBe('resume with steering')
  })

  it('5. Maintenance & Cleanup Endpoint (DELETE /orchestrator/jobs/clean)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // Save completed jobs in store
    const jobStore = server.getJobStore()
    await jobStore.save({
      jobId: 'e2e-completed-1',
      status: 'completed',
      workspacePath: tempDir,
      request: { scope: 'c1' },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    })

    // Call Clean endpoint
    const cleanRes = await makeHttpRequest(port, '/orchestrator/jobs/clean', 'DELETE', {
      maxAgeMs: 0,
    })

    expect(cleanRes.statusCode).toBe(200)
    expect(cleanRes.json.purgedJobs).toBe(1)

    // Verify purged from store
    const found = await jobStore.findById('e2e-completed-1')
    expect(found).toBeNull()
  })

  it('6. Bearer Token Security Strategy (AUTH_MODE=bearer)', async () => {
    server = new HttpServer({
      port: 0,
      host: '127.0.0.1',
      auth: { mode: 'bearer', bearerToken: 'secret_e2e_bearer_123' },
    })
    await server.start()
    const port = server.getPort()

    // 1. Unauthenticated request -> HTTP 401
    const unauthRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', { scope: 'test' })
    expect(unauthRes.statusCode).toBe(401)
    expect(unauthRes.json.code).toBe('UNAUTHORIZED')

    // 2. Request with invalid token -> HTTP 401
    const invalidRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { scope: 'test' },
      { Authorization: 'Bearer wrong_token' }
    )
    expect(invalidRes.statusCode).toBe(401)

    // 3. Request with valid Bearer token -> HTTP 202
    const validBearerRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { scope: 'test' },
      { Authorization: 'Bearer secret_e2e_bearer_123' }
    )
    expect(validBearerRes.statusCode).toBe(202)

    // 4. Request with valid X-API-Key header -> HTTP 202
    const validApiKeyRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { scope: 'test' },
      { 'X-API-Key': 'secret_e2e_bearer_123' }
    )
    expect(validApiKeyRes.statusCode).toBe(202)
  })

  it('7. Basic Auth Security Strategy (AUTH_MODE=basic)', async () => {
    server = new HttpServer({
      port: 0,
      host: '127.0.0.1',
      auth: { mode: 'basic', basicUser: 'admin', basicPass: 'super_secret_pass' },
    })
    await server.start()
    const port = server.getPort()

    // 1. Unauthenticated request -> HTTP 401 + WWW-Authenticate header
    const unauthRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', { scope: 'test' })
    expect(unauthRes.statusCode).toBe(401)
    expect(unauthRes.headers['www-authenticate']).toContain('Basic realm=')

    // 2. Request with valid Basic Auth -> HTTP 202
    const validCredentials = Buffer.from('admin:super_secret_pass').toString('base64')
    const validRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { scope: 'test' },
      { Authorization: `Basic ${validCredentials}` }
    )
    expect(validRes.statusCode).toBe(202)
  })

  it('8. Non-Interactive Safeguards & Validation Rejections', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // Rejects refine: true
    const refineRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      scope: 'test',
      refine: true,
    })
    expect(refineRes.statusCode).toBe(400)
    expect(refineRes.json.code).toBe('REFINE_NOT_SUPPORTED_IN_HTTP_MODE')

    // Rejects mode: deep_thinking
    const deepRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      scope: 'test',
      mode: 'deep_thinking',
    })
    expect(deepRes.statusCode).toBe(400)
    expect(deepRes.json.code).toBe('INTERACTIVE_MODE_NOT_ALLOWED')

    // Returns HTTP 404 for unknown job ID
    const notFoundRes = await makeHttpRequest(port, '/orchestrator/status/non-existent-uuid')
    expect(notFoundRes.statusCode).toBe(404)
    expect(notFoundRes.json.code).toBe('JOB_NOT_FOUND')
  })

  it('9. Local Project Settings Management (GET & POST /orchestrator/settings)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // 1. GET settings (creates local .harness-kit/settings.json if not existing)
    const getRes = await makeHttpRequest(port, `/orchestrator/settings?projectPath=${encodeURIComponent(tempDir)}`)
    expect(getRes.statusCode).toBe(200)
    expect(getRes.json.projectPath).toBe(tempDir)
    expect(getRes.json.settings).toBeDefined()

    const localSettingsFile = join(tempDir, '.harness-kit', 'settings.json')
    expect(existsSync(localSettingsFile)).toBe(true)

    // 2. POST settings (updates local settings file)
    const postRes = await makeHttpRequest(port, '/orchestrator/settings', 'POST', {
      projectPath: tempDir,
      settings: {
        'claude-cli': {
          timeoutMs: 120000,
          phases: {
            DEVELOPMENT: { timeoutMs: 300000 },
          },
        },
      },
    })

    expect(postRes.statusCode).toBe(200)
    expect(postRes.json.settings['claude-cli']?.timeoutMs).toBe(120000)

    const updatedContent = JSON.parse(readFileSync(localSettingsFile, 'utf-8'))
    expect(updatedContent['claude-cli']?.timeoutMs).toBe(120000)
  })
})
