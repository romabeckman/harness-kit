import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { HttpServerError } from '../types'
import type { JobStoreRepository } from '../repository/JobStoreRepository'
import type { JobQueue } from '../queue/JobQueue'
import type { WorkspaceLockManager } from '../mutex/WorkspaceLockManager'
import type { HttpServerConfig, OrchestrationJob, HealthStatusVo } from '../types'
import type { RunRequestDtoExtended } from '../dto/RunRequestDto'
import type { RunResponseDto } from '../dto/RunResponseDto'
import type { JobStatusDto } from '../dto/JobStatusDto'
import { DtoMappers } from '../mappers/DtoMappers'
import { OpenApiSpecGenerator } from '../docs/OpenApiSpecGenerator'

export class RouteHandlers {
  constructor(
    private jobStore: JobStoreRepository,
    private jobQueue: JobQueue,
    private lockManager?: WorkspaceLockManager,
    private config?: HttpServerConfig
  ) {}

  /**
   * Main incoming request dispatcher for native Node http.Server.
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`)
      const pathname = url.pathname
      const method = (req.method ?? 'GET').toUpperCase()

      if (method === 'POST' && pathname === '/orchestrator/run') {
        await this.handleRunJob(req, res)
        return
      }

      if (method === 'GET' && pathname.startsWith('/orchestrator/status/')) {
        const jobId = pathname.replace('/orchestrator/status/', '')
        await this.handleGetJobStatus(jobId, res)
        return
      }

      if (method === 'GET' && pathname === '/health') {
        await this.handleHealthCheck(res)
        return
      }

      if (method === 'GET' && pathname === '/docs') {
        this.handleDocsHtml(res)
        return
      }

      if (method === 'GET' && pathname === '/docs/openapi.json') {
        this.handleDocsJson(res)
        return
      }

      this.sendJson(res, 404, { error: 'Route not found', code: 'NOT_FOUND' })
    } catch (err: any) {
      if (err instanceof HttpServerError) {
        this.sendJson(res, err.statusCode, { error: err.message, code: err.code })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        this.sendJson(res, 500, { error: message, code: 'INTERNAL_SERVER_ERROR' })
      }
    }
  }

  private async handleRunJob(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawBody = await this.readBody(req)
    let body: RunRequestDtoExtended
    try {
      body = JSON.parse(rawBody)
    } catch {
      throw new HttpServerError(400, 'INVALID_JSON', 'Invalid JSON body in request')
    }

    this.validatePathTraversal(body.projectPaths)

    // DtoMappers validates refine: true and mode: 'deep_thinking' and throws HttpServerError(400)
    DtoMappers.toOrchestratorConfig(body)

    const workspacePath = DtoMappers.resolveWorkspacePath(body)
    const jobId = randomUUID()
    const createdAt = new Date().toISOString()

    const job: OrchestrationJob = {
      jobId,
      status: 'queued',
      workspacePath,
      request: body,
      createdAt,
    }

    await this.jobStore.save(job)
    this.jobQueue.enqueue(job)

    const responseDto: RunResponseDto = {
      jobId,
      status: 'queued',
      workspacePath,
      enqueuedAt: createdAt,
      statusUrl: `/orchestrator/status/${jobId}`,
    }

    this.sendJson(res, 202, responseDto)
  }

  private async handleGetJobStatus(jobId: string, res: ServerResponse): Promise<void> {
    if (!jobId || jobId.trim() === '') {
      throw new HttpServerError(400, 'INVALID_JOB_ID', 'Job ID is required')
    }

    const job = await this.jobStore.findById(jobId)
    if (!job) {
      throw new HttpServerError(404, 'JOB_NOT_FOUND', `Job with ID '${jobId}' not found`)
    }

    const statusDto: JobStatusDto = {
      jobId: job.jobId,
      status: job.status,
      workspacePath: job.workspacePath,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      progress: job.progress,
      error: job.error,
    }

    this.sendJson(res, 200, statusDto)
  }

  private async handleHealthCheck(res: ServerResponse): Promise<void> {
    const activeJobs = await this.jobStore.listActive()
    const queuedJobs = this.jobQueue.size
    const mem = process.memoryUsage()

    const healthVo: HealthStatusVo = {
      status: 'healthy',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      activeJobs: activeJobs.length,
      queuedJobs,
      memoryUsage: {
        rssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
        heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
      },
    }

    this.sendJson(res, 200, healthVo)
  }

  private handleDocsHtml(res: ServerResponse): void {
    const html = OpenApiSpecGenerator.getSwaggerHtml()
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html, 'utf-8'),
    })
    res.end(html)
  }

  private handleDocsJson(res: ServerResponse): void {
    const spec = OpenApiSpecGenerator.getSpec()
    this.sendJson(res, 200, spec)
  }

  private validatePathTraversal(projectPaths?: string[]): void {
    if (!projectPaths || projectPaths.length === 0) return

    const allowedWorkspaces = this.config?.allowedWorkspaces

    for (const p of projectPaths) {
      if (typeof p !== 'string') continue

      if (p.includes('..')) {
        throw new HttpServerError(
          400,
          'PATH_TRAVERSAL_DETECTED',
          `Path traversal detected in projectPath: '${p}'`
        )
      }

      if (allowedWorkspaces && allowedWorkspaces.length > 0) {
        const resolvedPath = resolve(process.cwd(), p)
        const isAllowed = allowedWorkspaces.some((allowed) => {
          const resolvedAllowed = resolve(process.cwd(), allowed)
          return resolvedPath === resolvedAllowed || resolvedPath.startsWith(resolvedAllowed + '/') || resolvedPath.startsWith(resolvedAllowed + '\\')
        })

        if (!isAllowed) {
          throw new HttpServerError(
            400,
            'WORKSPACE_NOT_ALLOWED',
            `Project path '${p}' is outside allowed workspaces.`
          )
        }
      }
    }
  }

  private async readBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<string> {
    return new Promise((resolvePromise, rejectPromise) => {
      let size = 0
      const chunks: Buffer[] = []

      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) {
          req.destroy()
          rejectPromise(
            new HttpServerError(400, 'PAYLOAD_TOO_LARGE', 'Payload size exceeds 1MB limit')
          )
          return
        }
        chunks.push(chunk)
      })

      req.on('end', () => {
        resolvePromise(Buffer.concat(chunks).toString('utf-8'))
      })

      req.on('error', (err) => {
        rejectPromise(err)
      })
    })
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    const jsonStr = JSON.stringify(data)
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonStr, 'utf-8'),
    })
    res.end(jsonStr)
  }
}
