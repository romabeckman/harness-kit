import { describe, it, expect } from 'vitest'
import { HttpServerError, WorkerPoolConfig } from '../domain/types'
import type { HttpServerConfig, HealthStatusVo, OpenApiSpec, OrchestrationJob, JobStatus } from '../domain/types'
import type { RunRequestDto, RunRequestDtoExtended } from '../adapters/inbound/http/dto/RunRequestDto'
import type { RunResponseDto } from '../adapters/inbound/http/dto/RunResponseDto'
import type { JobStatusDto } from '../adapters/inbound/http/dto/JobStatusDto'

describe('Server Types and DTOs', () => {
  describe('HttpServerError', () => {
    it('instantiates correctly with statusCode, code, and message', () => {
      const err = new HttpServerError(400, 'BAD_REQUEST', 'Invalid input')
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(HttpServerError)
      expect(err.statusCode).toBe(400)
      expect(err.code).toBe('BAD_REQUEST')
      expect(err.message).toBe('Invalid input')
      expect(err.name).toBe('HttpServerError')
    })
  })

  describe('HttpServerConfig interface', () => {
    it('allows valid HttpServerConfig objects', () => {
      const config: HttpServerConfig = {
        port: 3000,
        host: '0.0.0.0',
        allowedWorkspaces: ['/workspace/app'],
      }
      expect(config.port).toBe(3000)
      expect(config.host).toBe('0.0.0.0')
      expect(config.allowedWorkspaces).toEqual(['/workspace/app'])
    })
  })

  describe('HealthStatusVo interface', () => {
    it('supports HealthStatusVo structure UT-1.2.4', () => {
      const health: HealthStatusVo = {
        status: 'healthy',
        uptimeSeconds: 120,
        timestamp: '2026-08-06T12:00:00.000Z',
        activeJobs: 2,
        queuedJobs: 1,
        memoryUsage: {
          rssMb: 150.5,
          heapUsedMb: 85.2,
        },
      }
      expect(health.status).toBe('healthy')
      expect(health.uptimeSeconds).toBe(120)
      expect(health.activeJobs).toBe(2)
      expect(health.queuedJobs).toBe(1)
      expect(health.memoryUsage.rssMb).toBe(150.5)
    })
  })

  describe('OpenApiSpec interface', () => {
    it('supports OpenAPI 3.0.3 spec structure UT-1.2.5', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: {
          title: 'Harness SDK HTTP Server API',
          version: '1.0.0',
        },
        paths: {},
        components: {},
      }
      expect(spec.openapi).toBe('3.0.3')
      expect(spec.info.title).toBe('Harness SDK HTTP Server API')
    })
  })

  describe('RunRequestDto & RunRequestDtoExtended', () => {
    it('supports base and extended run request fields', () => {
      const baseReq: RunRequestDto = {
        scope: 'test-scope',
        mode: 'quick',
        action: 'reset',
        score: 0.8,
        reworks: 3,
      }
      expect(baseReq.mode).toBe('quick')

      const extReq: RunRequestDtoExtended = {
        idempotencyKey: 'idemp-type-test',
        scope: 'test',
        ...baseReq,
        project: ['backend'],
        steeringMessage: 'keep simple',
        agent: 'claude-cli',
        model: 'claude-3-5-sonnet',
        effort: 'high',
        skipValidation: true,
        skipMemory: true,
      }
      expect(extReq.skipValidation).toBe(true)
      expect(extReq.project).toEqual(['backend'])
    })
  })

  describe('RunResponseDto', () => {
    it('supports run response structure UT-1.2.2', () => {
      const res: RunResponseDto = {
        jobId: 'job-uuid-1234',
        status: 'queued',
        enqueuedAt: '2026-08-06T12:00:00.000Z',
        statusUrl: 'http://localhost:3000/orchestrator/status/job-uuid-1234',
      }
      expect(res.jobId).toBe('job-uuid-1234')
      expect(res.status).toBe('queued')
      expect(res.statusUrl).toContain('job-uuid-1234')
    })
  })

  describe('JobStatusDto & OrchestrationJob', () => {
    it('supports job status read model structure UT-1.2.3', () => {
      const status: JobStatus = 'running'
      const dto: JobStatusDto = {
        jobId: 'job-555',
        status,
        createdAt: '2026-08-06T12:00:00.000Z',
        startedAt: '2026-08-06T12:00:01.000Z',
        progress: { phase: 'DEVELOPMENT', step: 2 },
      }
      expect(dto.status).toBe('running')
      expect(dto.progress?.phase).toBe('DEVELOPMENT')
    })

    it('supports OrchestrationJob entity', () => {
      const job: OrchestrationJob = {
        jobId: 'job-101',
        status: 'queued',
        workspacePath: '/workspace/app',
        request: { idempotencyKey: 'id-job101', scope: 'build app', project: 'backend', agent: 'claude-cli' },
        createdAt: '2026-08-06T12:00:00.000Z',
      }
      expect(job.status).toBe('queued')
      expect(job.workspacePath).toBe('/workspace/app')
    })
  })

  describe('WorkerPoolConfig', () => {
    it('allows valid maxConcurrency >= 1', () => {
      const config = new WorkerPoolConfig({ maxConcurrency: 4 })
      expect(config.maxConcurrency).toBe(4)
    })

    it('defaults maxConcurrency to 4 if omitted', () => {
      const config = new WorkerPoolConfig()
      expect(config.maxConcurrency).toBe(4)
    })

    it('throws HttpServerError if maxConcurrency < 1', () => {
      expect(() => new WorkerPoolConfig({ maxConcurrency: 0 })).toThrow()
    })
  })
})
