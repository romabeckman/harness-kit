import { describe, it, expect, beforeEach } from 'vitest'
import { GetJobStatusUseCase } from '../GetJobStatusUseCase'
import { InMemoryJobStore } from '../../../adapters/outbound/repository/InMemoryJobStore'
import { HttpServerError, OrchestrationJob } from '../../../domain/types'

describe('GetJobStatusUseCase', () => {
  let jobStore: InMemoryJobStore
  let useCase: GetJobStatusUseCase

  beforeEach(() => {
    jobStore = new InMemoryJobStore()
    useCase = new GetJobStatusUseCase(jobStore)
  })

  it('returns JobStatusDto for existing job', async () => {
    const job: OrchestrationJob = {
      jobId: 'job-status-123',
      status: 'running',
      workspacePath: '/tmp/workspace',
      request: { idempotencyKey: 'id-stat', scope: 'test', project: 'backend', agent: 'claude-cli' },
      createdAt: new Date().toISOString(),
    }
    await jobStore.save(job)

    const result = await useCase.execute('job-status-123')
    expect(result.jobId).toBe('job-status-123')
    expect(result.status).toBe('running')
  })

  it('throws HttpServerError(404) for missing job', async () => {
    await expect(useCase.execute('unknown-id')).rejects.toThrowError(HttpServerError)
  })

  it('throws HttpServerError(400) for empty job ID', async () => {
    await expect(useCase.execute('')).rejects.toThrowError(HttpServerError)
  })
})
