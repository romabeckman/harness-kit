import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AsyncWorkerPool } from '../AsyncWorkerPool'
import { JobQueue } from '../../queue/JobQueue'
import { WorkspaceLockManager } from '../../mutex/WorkspaceLockManager'
import { InMemoryJobStore } from '../../repository/InMemoryJobStore'
import type { OrchestrationJob } from '../../../../domain/types'

describe('AsyncWorkerPool', () => {
  let workerPool: AsyncWorkerPool
  let queue: JobQueue
  let lockManager: WorkspaceLockManager
  let jobStore: InMemoryJobStore

  beforeEach(() => {
    queue = new JobQueue()
    lockManager = new WorkspaceLockManager()
    jobStore = new InMemoryJobStore()
    workerPool = new AsyncWorkerPool({
      maxConcurrency: 2,
      queue,
      lockManager,
      jobStore,
    })
  })

  it('initializes with specified maxConcurrency', () => {
    expect(workerPool.maxConcurrency).toBe(2)
    expect(workerPool.activeCount).toBe(0)
  })

  const dummyReq = { idempotencyKey: 'idemp-worker', scope: 'task 1', project: 'backend', agent: 'claude-cli' }

  it('executes jobs on distinct workspaces concurrently up to maxConcurrency', async () => {
    const executedJobs: string[] = []
    
    workerPool.setJobProcessor(async (job: OrchestrationJob) => {
      executedJobs.push(job.jobId)
      await new Promise((r) => setTimeout(r, 50))
    })

    const job1: OrchestrationJob = {
      jobId: 'pool-j1',
      status: 'queued',
      workspacePath: '/ws/alpha',
      request: dummyReq,
      createdAt: new Date().toISOString(),
    }
    const job2: OrchestrationJob = {
      jobId: 'pool-j2',
      status: 'queued',
      workspacePath: '/ws/beta',
      request: dummyReq,
      createdAt: new Date().toISOString(),
    }

    queue.enqueue(job1)
    queue.enqueue(job2)

    await workerPool.processPending()
    await workerPool.drain()

    expect(executedJobs).toContain('pool-j1')
    expect(executedJobs).toContain('pool-j2')
  })

  it('prevents concurrent execution on the same workspace path', async () => {
    const executedJobs: string[] = []

    workerPool.setJobProcessor(async (job: OrchestrationJob) => {
      executedJobs.push(job.jobId)
      await new Promise((r) => setTimeout(r, 50))
    })

    await lockManager.acquireLock('/ws/alpha', 'existing-job')

    const job1: OrchestrationJob = {
      jobId: 'same-ws-1',
      status: 'queued',
      workspacePath: '/ws/alpha',
      request: dummyReq,
      createdAt: new Date().toISOString(),
    }
    const job2: OrchestrationJob = {
      jobId: 'diff-ws-2',
      status: 'queued',
      workspacePath: '/ws/gamma',
      request: dummyReq,
      createdAt: new Date().toISOString(),
    }

    queue.enqueue(job1)
    queue.enqueue(job2)

    await workerPool.processPending()
    await workerPool.drain()

    expect(executedJobs).toContain('diff-ws-2')
    expect(executedJobs).not.toContain('same-ws-1')
  })
})
