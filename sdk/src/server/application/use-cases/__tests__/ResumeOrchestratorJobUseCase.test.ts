import { describe, it, expect, beforeEach } from 'vitest'
import { ResumeOrchestratorJobUseCase } from '../ResumeOrchestratorJobUseCase'
import { InMemoryJobStore } from '../../../adapters/outbound/repository/InMemoryJobStore'
import { JobQueue } from '../../../adapters/outbound/queue/JobQueue'
import { HttpServerError, OrchestrationJob } from '../../../domain/types'

describe('ResumeOrchestratorJobUseCase', () => {
  let jobStore: InMemoryJobStore
  let jobQueue: JobQueue
  let useCase: ResumeOrchestratorJobUseCase

  beforeEach(() => {
    jobStore = new InMemoryJobStore()
    jobQueue = new JobQueue()
    useCase = new ResumeOrchestratorJobUseCase(jobStore, jobQueue)
  })

  it('resumes a failed or completed job by re-enqueuing with action: "resume"', async () => {
    const failedJob: OrchestrationJob = {
      jobId: 'failed-job-123',
      status: 'failed',
      workspacePath: '/tmp/workspace',
      request: { idempotencyKey: 'id-res1', scope: 'test-resume', action: 'reset', project: 'backend', agent: 'claude-cli' },
      createdAt: new Date().toISOString(),
      error: { code: 'TEST_ERR', message: 'Something went wrong' },
    }
    await jobStore.save(failedJob)

    const result = await useCase.execute('failed-job-123')
    expect(result.jobId).toBeDefined()
    expect(result.jobId).not.toBe('failed-job-123')
    expect(result.status).toBe('queued')

    const resumedJob = await jobStore.findById(result.jobId)
    expect(resumedJob).not.toBeNull()
    expect(resumedJob?.request.action).toBe('resume')
    expect(jobQueue.size).toBe(1)
  })

  it('throws HttpServerError(400) when trying to resume a currently running job', async () => {
    const runningJob: OrchestrationJob = {
      jobId: 'running-job-456',
      status: 'running',
      workspacePath: '/tmp/workspace',
      request: { idempotencyKey: 'id-res2', scope: 'test-running', project: 'backend', agent: 'claude-cli' },
      createdAt: new Date().toISOString(),
    }
    await jobStore.save(runningJob)

    await expect(useCase.execute('running-job-456')).rejects.toThrowError(HttpServerError)
  })

  it('throws HttpServerError(404) for non-existent job ID', async () => {
    await expect(useCase.execute('unknown-job-id')).rejects.toThrowError(HttpServerError)
  })
})
