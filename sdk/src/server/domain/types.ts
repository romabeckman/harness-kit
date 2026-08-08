import type { RunRequestDtoExtended } from '../adapters/inbound/http/dto/RunRequestDto'
import type { AuthConfig } from '../adapters/outbound/auth/types'

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'aborted'

export interface HttpServerConfig {
  port?: number
  host?: string
  allowedWorkspaces?: string[]
  auth?: AuthConfig
}

export interface HealthStatusVo {
  status: 'healthy' | 'degraded' | 'unhealthy'
  uptimeSeconds: number
  timestamp: string
  activeJobs: number
  queuedJobs: number
  memoryUsage: {
    rssMb: number
    heapUsedMb: number
  }
  error?: string
}

export interface OpenApiSpec {
  openapi: '3.0.3'
  info: {
    title: string
    version: string
    description?: string
  }
  paths: Record<string, unknown>
  components: Record<string, Record<string, unknown>>
}

export class WorkerPoolConfig {
  readonly maxConcurrency: number

  constructor(options?: { maxConcurrency?: number }) {
    const val = options?.maxConcurrency ?? 4
    if (val < 1 || !Number.isInteger(val)) {
      throw new HttpServerError(400, 'INVALID_CONCURRENCY', `maxConcurrency must be an integer >= 1, got ${val}`)
    }
    this.maxConcurrency = val
  }
}

export class HttpServerError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'HttpServerError'
    this.statusCode = statusCode
    this.code = code
    Object.setPrototypeOf(this, HttpServerError.prototype)
  }
}

export interface OrchestrationJob {
  jobId: string
  idempotencyKey?: string
  status: JobStatus
  workspacePath: string
  request: RunRequestDtoExtended
  createdAt: string
  startedAt?: string
  completedAt?: string
  progress?: {
    phase?: string
    step?: number
  }
  error?: {
    code: string
    message: string
  }
  durationMs?: number
}
