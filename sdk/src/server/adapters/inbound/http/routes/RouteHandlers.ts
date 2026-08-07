import type { IncomingMessage, ServerResponse } from 'node:http'
import { HttpServerError, HttpServerConfig } from '../../../../domain/types'
import type { JobStoreRepository } from '../../../outbound/repository/JobStoreRepository'
import type { JobQueue } from '../../../outbound/queue/JobQueue'
import type { WorkspaceLockManager } from '../../../outbound/mutex/WorkspaceLockManager'
import type { RunRequestDtoExtended } from '../dto/RunRequestDto'
import {
  RunOrchestratorJobUseCase,
  GetJobStatusUseCase,
  GetHealthStatusUseCase,
  GetOpenApiDocsUseCase,
  ResumeOrchestratorJobUseCase,
  CleanJobsAndWorktreesUseCase,
  GetSettingsUseCase,
  UpdateSettingsUseCase,
  GetTokensTelemetryUseCase,
} from '../../../../application/use-cases'
import { AuthStrategyFactory } from '../../../outbound/auth/AuthStrategyFactory'
import type { IAuthStrategy } from '../../../outbound/auth/types'

export interface UseCaseContainer {
  runJobUseCase?: RunOrchestratorJobUseCase
  getStatusUseCase?: GetJobStatusUseCase
  getHealthUseCase?: GetHealthStatusUseCase
  docsUseCase?: GetOpenApiDocsUseCase
  resumeJobUseCase?: ResumeOrchestratorJobUseCase
  cleanUseCase?: CleanJobsAndWorktreesUseCase
  getSettingsUseCase?: GetSettingsUseCase
  updateSettingsUseCase?: UpdateSettingsUseCase
  getTokensUseCase?: GetTokensTelemetryUseCase
}

export class RouteHandlers {
  private runJobUseCase: RunOrchestratorJobUseCase
  private getStatusUseCase: GetJobStatusUseCase
  private getHealthUseCase: GetHealthStatusUseCase
  private docsUseCase: GetOpenApiDocsUseCase
  private resumeJobUseCase: ResumeOrchestratorJobUseCase
  private cleanUseCase: CleanJobsAndWorktreesUseCase
  private getSettingsUseCase: GetSettingsUseCase
  private updateSettingsUseCase: UpdateSettingsUseCase
  private getTokensUseCase: GetTokensTelemetryUseCase
  private authStrategy: IAuthStrategy
  private config?: HttpServerConfig
  private requestCounts = new Map<string, { count: number; resetAt: number }>()
  private maxRequestsPerWindow = 120
  private windowMs = 60 * 1000

  constructor(
    jobStore: JobStoreRepository,
    jobQueue: JobQueue,
    _lockManager?: WorkspaceLockManager,
    config?: HttpServerConfig,
    useCases?: UseCaseContainer
  ) {
    this.config = config
    this.runJobUseCase = useCases?.runJobUseCase ?? new RunOrchestratorJobUseCase(jobStore, jobQueue, config)
    this.getStatusUseCase = useCases?.getStatusUseCase ?? new GetJobStatusUseCase(jobStore)
    this.getHealthUseCase = useCases?.getHealthUseCase ?? new GetHealthStatusUseCase(jobStore, jobQueue)
    this.docsUseCase = useCases?.docsUseCase ?? new GetOpenApiDocsUseCase()
    this.resumeJobUseCase = useCases?.resumeJobUseCase ?? new ResumeOrchestratorJobUseCase(jobStore, jobQueue)
    this.cleanUseCase = useCases?.cleanUseCase ?? new CleanJobsAndWorktreesUseCase(jobStore, config)
    this.getSettingsUseCase = useCases?.getSettingsUseCase ?? new GetSettingsUseCase(config)
    this.updateSettingsUseCase = useCases?.updateSettingsUseCase ?? new UpdateSettingsUseCase(config)
    this.getTokensUseCase = useCases?.getTokensUseCase ?? new GetTokensTelemetryUseCase(config)
    this.authStrategy = AuthStrategyFactory.create(config?.auth)
  }

  private checkRateLimit(clientIp: string): void {
    const now = Date.now()
    const record = this.requestCounts.get(clientIp)
    if (!record || now > record.resetAt) {
      this.requestCounts.set(clientIp, { count: 1, resetAt: now + this.windowMs })
      return
    }
    record.count++
    if (record.count > this.maxRequestsPerWindow) {
      throw new HttpServerError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.')
    }
  }

  /**
   * Main incoming request dispatcher for native Node http.Server.
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const clientIp = req.socket?.remoteAddress || '127.0.0.1'
      this.checkRateLimit(clientIp)

      const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`)
      const pathname = url.pathname
      const method = (req.method ?? 'GET').toUpperCase()

      if (pathname.startsWith('/orchestrator/')) {
        if (!this.authStrategy.authenticate(req.headers)) {
          const authMode = (this.config?.auth?.mode ?? process.env.AUTH_MODE ?? 'none').toLowerCase()
          if (authMode === 'basic') {
            res.setHeader('WWW-Authenticate', 'Basic realm="Harness-Kit Daemon"')
          }
          throw new HttpServerError(401, 'UNAUTHORIZED', 'Authentication credentials invalid or missing.')
        }
      }

      if (method === 'POST' && pathname === '/orchestrator/run') {
        await this.handleRunJob(req, res)
        return
      }

      if (method === 'POST' && pathname.startsWith('/orchestrator/jobs/') && pathname.endsWith('/resume')) {
        const jobId = pathname.replace('/orchestrator/jobs/', '').replace('/resume', '')
        await this.handleResumeJob(jobId, req, res)
        return
      }

      if (method === 'DELETE' && pathname === '/orchestrator/jobs/clean') {
        await this.handleCleanJobs(req, res)
        return
      }

      if (method === 'GET' && (pathname === '/orchestrator/tokens' || pathname === '/orchestrator/telemetry/tokens')) {
        const project = url.searchParams.get('project') ?? undefined
        const jobId = url.searchParams.get('jobId') ?? url.searchParams.get('id') ?? undefined
        await this.handleGetTokensTelemetry(project, jobId, res)
        return
      }

      if (method === 'GET' && pathname === '/orchestrator/settings') {
        const project = url.searchParams.get('project') ?? undefined
        const agent = url.searchParams.get('agent') ?? undefined
        await this.handleGetSettings(project, agent, res)
        return
      }

      if (method === 'POST' && pathname === '/orchestrator/settings') {
        await this.handleUpdateSettings(req, res)
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

    const responseDto = await this.runJobUseCase.execute(body)
    this.sendJson(res, 202, responseDto)
  }

  private async handleResumeJob(jobId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawBody = await this.readBody(req)
    let overrides: Partial<RunRequestDtoExtended> = {}
    if (rawBody && rawBody.trim().length > 0) {
      try {
        overrides = JSON.parse(rawBody)
      } catch {
        throw new HttpServerError(400, 'INVALID_JSON', 'Invalid JSON body in resume request')
      }
    }

    const responseDto = await this.resumeJobUseCase.execute(jobId, overrides)
    this.sendJson(res, 202, responseDto)
  }

  private async handleCleanJobs(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawBody = await this.readBody(req)
    let maxAgeMs = 0
    if (rawBody && rawBody.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawBody)
        if (typeof parsed.maxAgeMs === 'number') maxAgeMs = parsed.maxAgeMs
      } catch {}
    }

    const cleanResult = await this.cleanUseCase.execute(maxAgeMs)
    this.sendJson(res, 200, cleanResult)
  }

  private async handleGetSettings(projectIdentifier: string | undefined, agentIdentifier: string | undefined, res: ServerResponse): Promise<void> {
    const result = await this.getSettingsUseCase.execute(projectIdentifier, agentIdentifier)
    this.sendJson(res, 200, result)
  }

  private async handleGetTokensTelemetry(projectIdentifier: string | undefined, jobId: string | undefined, res: ServerResponse): Promise<void> {
    const result = await this.getTokensUseCase.execute(projectIdentifier, jobId)
    this.sendJson(res, 200, result)
  }

  private async handleUpdateSettings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawBody = await this.readBody(req)
    let parsed: any
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      throw new HttpServerError(400, 'INVALID_JSON', 'Invalid JSON body in settings request')
    }

    const project = typeof parsed.project === 'string' ? parsed.project : undefined
    const agent = typeof parsed.agent === 'string' ? parsed.agent : undefined

    const settingsPayload = parsed.settings ?? (parsed.project ? { ...parsed, project: undefined, agent: undefined } : parsed)

    const result = await this.updateSettingsUseCase.execute(settingsPayload, project, agent)
    this.sendJson(res, 200, result)
  }

  private async handleGetJobStatus(jobId: string, res: ServerResponse): Promise<void> {
    const statusDto = await this.getStatusUseCase.execute(jobId)
    this.sendJson(res, 200, statusDto)
  }

  private async handleHealthCheck(res: ServerResponse): Promise<void> {
    const healthVo = await this.getHealthUseCase.execute()
    this.sendJson(res, 200, healthVo)
  }

  private handleDocsHtml(res: ServerResponse): void {
    const html = this.docsUseCase.getSwaggerHtml()
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html, 'utf-8'),
    })
    res.end(html)
  }

  private handleDocsJson(res: ServerResponse): void {
    const spec = this.docsUseCase.getSpec()
    this.sendJson(res, 200, spec)
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
