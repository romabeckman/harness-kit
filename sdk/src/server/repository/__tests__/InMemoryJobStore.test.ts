import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryJobStore } from '../InMemoryJobStore'
import type { OrchestrationJob } from '../../types'

describe('InMemoryJobStore', () => {
  let store: InMemoryJobStore

  beforeEach(() => {
    store = new InMemoryJobStore()
  })

  const sampleJob: OrchestrationJob = {
    jobId: 'job-888',
    status: 'queued',
    workspacePath: '/workspace/project-1',
    request: {
      scope: 'test-scope',
      mode: 'fast',
    },
    createdAt: new Date().toISOString(),
  }

  it('IT-2.1.1: should save and find job by jobId', async () => {
    await store.save(sampleJob)

    const found = await store.findById('job-888')

    expect(found).not.toBeNull()
    expect(found?.jobId).toBe('job-888')
    expect(found?.status).toBe('queued')
    expect(found?.workspacePath).toBe('/workspace/project-1')
    expect(found?.request.scope).toBe('test-scope')
  })

  it('should return null when searching for non-existent jobId', async () => {
    const found = await store.findById('non-existent-id')
    expect(found).toBeNull()
  })

  it('IT-2.1.2: should update job status and attach error payload atomically', async () => {
    await store.save(sampleJob)

    const errorPayload = { code: 'EXECUTION_FAILURE', message: 'Disk full' }
    await store.updateStatus('job-888', 'failed', errorPayload)

    const updated = await store.findById('job-888')
    expect(updated?.status).toBe('failed')
    expect(updated?.error).toEqual(errorPayload)
    expect(updated?.completedAt).toBeDefined()
  })

  it('should set startedAt timestamp when transitioning to running status', async () => {
    await store.save(sampleJob)

    await store.updateStatus('job-888', 'running')

    const updated = await store.findById('job-888')
    expect(updated?.status).toBe('running')
    expect(updated?.startedAt).toBeDefined()
  })

  it('should throw an error when updating status for non-existent job', async () => {
    await expect(
      store.updateStatus('non-existent-id', 'completed')
    ).rejects.toThrow('Job not found: non-existent-id')
  })

  it('IT-2.1.3: should list only active (queued and running) jobs', async () => {
    const jobs: OrchestrationJob[] = [
      { ...sampleJob, jobId: 'job-1', status: 'queued' },
      { ...sampleJob, jobId: 'job-2', status: 'running' },
      { ...sampleJob, jobId: 'job-3', status: 'completed' },
      { ...sampleJob, jobId: 'job-4', status: 'failed' },
      { ...sampleJob, jobId: 'job-5', status: 'queued' },
    ]

    for (const job of jobs) {
      await store.save(job)
    }

    const activeJobs = await store.listActive()

    expect(activeJobs).toHaveLength(3)
    const activeIds = activeJobs.map((j) => j.jobId).sort()
    expect(activeIds).toEqual(['job-1', 'job-2', 'job-5'])
  })
})
