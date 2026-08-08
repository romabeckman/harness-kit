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

    // Register project identifier mapping for all E2E tests
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: tempDir,
    })

    try {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true })
      }
    } catch {}
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
    try {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true })
      }
    } catch {}
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

  it('3. Real Orchestration Job Execution Workflow using Project Identifier & Agent (POST /orchestrator/run & GET /orchestrator/status/:id)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // 1. Enqueue Job using registered project identifier "backend" and agent "claude-cli"
    const runRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      idempotencyKey: 'e2e-run-1',
      scope: 'e2e-http-run-test',
      project: 'backend',
      agent: 'claude-cli',
      mode: 'fast',
    })

    expect(runRes.statusCode).toBe(202)
    expect(runRes.json.jobId).toBeDefined()
    expect(runRes.json.status).toBe('queued')
    expect(runRes.json.workspacePath).toBeUndefined()
    const jobId = runRes.json.jobId

    // 2. Poll Status
    const statusRes = await makeHttpRequest(port, `/orchestrator/status/${jobId}`)
    expect(statusRes.statusCode).toBe(200)
    expect(statusRes.json.jobId).toBe(jobId)
    expect(statusRes.json.workspacePath).toBeUndefined()
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
      request: { idempotencyKey: 'id-e2e-fail', scope: 'resume-scope-test', action: 'reset', project: 'backend', agent: 'claude-cli' },
      createdAt: new Date().toISOString(),
      error: { code: 'PREV_FAIL', message: 'Simulated failure' },
    })

    // Call Resume endpoint
    const resumeRes = await makeHttpRequest(
      port,
      `/orchestrator/jobs/${previousJobId}/resume`,
      'POST',
      { steeringMessage: 'resume with steering', agent: 'claude-cli' }
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
      request: { idempotencyKey: 'id-e2e-comp', scope: 'c1', project: 'backend', agent: 'claude-cli' },
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
    const unauthRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', { scope: 'test', project: 'backend', agent: 'claude-cli' })
    expect(unauthRes.statusCode).toBe(401)
    expect(unauthRes.json.code).toBe('UNAUTHORIZED')

    // 2. Request with invalid token -> HTTP 401
    const invalidRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { idempotencyKey: 'idem-b1', scope: 'test', project: 'backend', agent: 'claude-cli' },
      { Authorization: 'Bearer wrong_token' }
    )
    expect(invalidRes.statusCode).toBe(401)

    // 3. Request with valid Bearer token -> HTTP 202
    const validBearerRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { idempotencyKey: 'idem-b2', scope: 'test', project: 'backend', agent: 'claude-cli' },
      { Authorization: 'Bearer secret_e2e_bearer_123' }
    )
    expect(validBearerRes.statusCode).toBe(202)

    // 4. Request with valid X-API-Key header -> HTTP 202
    const validApiKeyRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { idempotencyKey: 'idem-b3', scope: 'test', project: 'backend', agent: 'claude-cli' },
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
    const unauthRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', { idempotencyKey: 'idem-ba1', scope: 'test', project: 'backend', agent: 'claude-cli' })
    expect(unauthRes.statusCode).toBe(401)
    expect(unauthRes.headers['www-authenticate']).toContain('Basic realm=')

    // 2. Request with valid Basic Auth -> HTTP 202
    const validCredentials = Buffer.from('admin:super_secret_pass').toString('base64')
    const validRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { idempotencyKey: 'idem-ba2', scope: 'test', project: 'backend', agent: 'claude-cli' },
      { Authorization: `Basic ${validCredentials}` }
    )
    expect(validRes.statusCode).toBe(202)
  })

  it('8. Non-Interactive Safeguards & Validation Rejections', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // Rejects missing project parameter
    const missingProjRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      idempotencyKey: 'idem-sg1',
      scope: 'test',
      agent: 'claude-cli',
    })
    expect(missingProjRes.statusCode).toBe(400)
    expect(missingProjRes.json.code).toBe('MISSING_PROJECT_PARAMETER')

    // Rejects unregistered project identifier
    const unregProjRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      idempotencyKey: 'idem-sg2',
      scope: 'test',
      project: 'unregistered_proj',
      agent: 'claude-cli',
    })
    expect(unregProjRes.statusCode).toBe(400)
    expect(unregProjRes.json.code).toBe('PROJECT_NOT_FOUND')

    // Rejects missing agent parameter
    const missingAgentRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      idempotencyKey: 'idem-sg3',
      scope: 'test',
      project: 'backend',
    })
    expect(missingAgentRes.statusCode).toBe(400)
    expect(missingAgentRes.json.code).toBe('MISSING_AGENT_PARAMETER')

    // Rejects invalid agent parameter
    const invalidAgentRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      idempotencyKey: 'idem-sg4',
      scope: 'test',
      project: 'backend',
      agent: 'invalid-agent-name',
    })
    expect(invalidAgentRes.statusCode).toBe(400)
    expect(invalidAgentRes.json.code).toBe('INVALID_AGENT')

    // Rejects refine: true
    const refineRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      idempotencyKey: 'idem-sg5',
      scope: 'test',
      project: 'backend',
      agent: 'claude-cli',
      refine: true,
    })
    expect(refineRes.statusCode).toBe(400)
    expect(refineRes.json.code).toBe('REFINE_NOT_ALLOWED')

    // Rejects mode: deep_thinking
    const deepRes = await makeHttpRequest(port, '/orchestrator/run', 'POST', {
      idempotencyKey: 'idem-sg6',
      scope: 'test',
      project: 'backend',
      agent: 'claude-cli',
      mode: 'deep_thinking',
    })
    expect(deepRes.statusCode).toBe(400)
    expect(deepRes.json.code).toBe('INTERACTIVE_MODE_NOT_ALLOWED')

    // Returns HTTP 404 for unknown job ID
    const notFoundRes = await makeHttpRequest(port, '/orchestrator/status/non-existent-uuid')
    expect(notFoundRes.statusCode).toBe(404)
    expect(notFoundRes.json.code).toBe('JOB_NOT_FOUND')
  })

  it('9. Local Project Settings Management via Project Identifier & Agent (GET & POST /orchestrator/settings)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // 1. GET settings with ?project=backend&agent=claude-cli
    const getRes = await makeHttpRequest(port, '/orchestrator/settings?project=backend&agent=claude-cli')
    expect(getRes.statusCode).toBe(200)
    expect(getRes.json.project).toBe('backend')
    expect(getRes.json.projectPath).toBeUndefined()
    expect(getRes.json.settings).toBeDefined()

    const localSettingsFile = join(tempDir, '.harness-kit', 'settings.json')
    expect(existsSync(localSettingsFile)).toBe(true)

    // 2. POST settings with flat payload format
    const postRes = await makeHttpRequest(port, '/orchestrator/settings', 'POST', {
      project: 'backend',
      agent: 'claude-cli',
      timeoutMs: 120000,
      phases: ['bootstrap', 'planning', 'implementation', 'review_tl', 'review_adv', 'memory'],
      model: 'anthropic.claude-5-sonnet',
      effort: 'high',
    })
    expect(postRes.statusCode).toBe(200)
    expect(postRes.json.settings['claude']?.timeoutMs).toBe(120000)

    const updatedContent = JSON.parse(readFileSync(localSettingsFile, 'utf-8'))
    expect(updatedContent['claude']?.timeoutMs).toBe(120000)

    // 3. Unregistered project identifier -> HTTP 400
    const unregRes = await makeHttpRequest(port, '/orchestrator/settings?project=unknown_proj')
    expect(unregRes.statusCode).toBe(400)
    expect(unregRes.json.code).toBe('PROJECT_NOT_FOUND')
  })

  it('10. Webhook Git Synchronization (POST /orchestrator/webhook/sync)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    // 1. Trigger sync webhook on valid project
    const syncRes = await makeHttpRequest(port, '/orchestrator/webhook/sync', 'POST', {
      project: 'backend',
    })
    expect(syncRes.statusCode).toBe(200)
    expect(syncRes.json.status).toBe('synced')
    expect(syncRes.json.project).toBe('backend')
    expect(syncRes.json.baseBranch).toBe('main')
    expect(syncRes.json.fetchedAt).toBeDefined()

    // 2. Unregistered project -> HTTP 400
    const unregSyncRes = await makeHttpRequest(port, '/orchestrator/webhook/sync', 'POST', {
      project: 'unregistered_proj',
    })
    expect(unregSyncRes.statusCode).toBe(400)
    expect(unregSyncRes.json.code).toBe('PROJECT_NOT_FOUND')
  })

  it('11. JWT Authentication & RBAC Scoping Strategy (AUTH_MODE=jwt)', async () => {
    process.env.AUTH_MODE = 'jwt'
    process.env.AUTH_JWT_SECRET = 'e2e-jwt-secret-key-99'

    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    const { JwtAuthStrategy } = await import('../../../src/server/adapters/outbound/auth/JwtAuthStrategy.js')

    // Valid JWT with wildcard project access -> 202 Accepted
    const validToken = JwtAuthStrategy.signPayload({ sub: 'e2e-user', allowed_projects: ['*'] }, 'e2e-jwt-secret-key-99')
    const validRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { idempotencyKey: 'idem-jwt1', scope: 'jwt-test', project: 'backend', agent: 'claude-cli' },
      { Authorization: `Bearer ${validToken}` }
    )
    expect(validRes.statusCode).toBe(202)

    // JWT missing permission for 'backend' project -> 403 Forbidden
    const restrictedToken = JwtAuthStrategy.signPayload({ sub: 'e2e-user', allowed_projects: ['frontend'] }, 'e2e-jwt-secret-key-99')
    const forbiddenRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { idempotencyKey: 'idem-jwt2', scope: 'jwt-test', project: 'backend', agent: 'claude-cli' },
      { Authorization: `Bearer ${restrictedToken}` }
    )
    expect(forbiddenRes.statusCode).toBe(403)
    expect(forbiddenRes.json.code).toBe('FORBIDDEN')

    // Invalid JWT signature -> 401 Unauthorized
    const invalidRes = await makeHttpRequest(
      port,
      '/orchestrator/run',
      'POST',
      { idempotencyKey: 'idem-jwt3', scope: 'jwt-test', project: 'backend', agent: 'claude-cli' },
      { Authorization: 'Bearer invalid.jwt.signature' }
    )
    expect(invalidRes.statusCode).toBe(401)
  })

  it('12. HMAC Payload Signature Authentication (AUTH_MODE=hmac)', async () => {
    process.env.AUTH_MODE = 'hmac'
    process.env.AUTH_HMAC_SECRET = 'e2e-hmac-secret-88'

    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    const { HmacAuthStrategy } = await import('../../../src/server/adapters/outbound/auth/HmacAuthStrategy.js')

    const body = { project: 'backend' }
    const rawBody = JSON.stringify(body)
    const validSignature = HmacAuthStrategy.computeSignature(rawBody, 'e2e-hmac-secret-88')

    // Valid HMAC signature -> 200 OK
    const validRes = await makeHttpRequest(
      port,
      '/orchestrator/webhook/sync',
      'POST',
      body,
      { 'X-Signature-256': validSignature }
    )
    expect(validRes.statusCode).toBe(200)
    expect(validRes.json.status).toBe('synced')

    // Invalid HMAC signature -> 401 Unauthorized
    const invalidRes = await makeHttpRequest(
      port,
      '/orchestrator/webhook/sync',
      'POST',
      body,
      { 'X-Signature-256': 'sha256=invalid_hmac_hash' }
    )
    expect(invalidRes.statusCode).toBe(401)
  })

  it('13. Idempotency Key Enforcement & Duplicate Request Rejection (HTTP 409 Conflict)', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const port = server.getPort()

    const payload = {
      idempotencyKey: 'unique-e2e-idem-999',
      scope: 'idem-test',
      project: 'backend',
      agent: 'claude-cli',
    }

    // 1. Initial request with new idempotencyKey -> 202 Accepted
    const res1 = await makeHttpRequest(port, '/orchestrator/run', 'POST', payload)
    expect(res1.statusCode).toBe(202)
    expect(res1.json.jobId).toBeDefined()

    // 2. Duplicate request with same idempotencyKey -> 409 Conflict (DUPLICATE_IDEMPOTENCY_KEY)
    const res2 = await makeHttpRequest(port, '/orchestrator/run', 'POST', payload)
    expect(res2.statusCode).toBe(409)
    expect(res2.json.code).toBe('DUPLICATE_IDEMPOTENCY_KEY')
    expect(res2.json.message).toContain('unique-e2e-idem-999')
  })
})
