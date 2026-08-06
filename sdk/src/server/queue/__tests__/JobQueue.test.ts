import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JobQueue } from '../JobQueue'
import { WorkspaceLockManager } from '../../mutex/WorkspaceLockManager'
import type { OrchestrationJob } from '../../types'

describe('JobQueue', () => {
  let queue: JobQueue
  let lockManager: WorkspaceLockManager

  beforeEach(() => {
    queue = new JobQueue()
    lockManager = new WorkspaceLockManager()
  })

  const createJob = (jobId: string, workspacePath: string): OrchestrationJob => ({
    jobId,
    status: 'queued',
    workspacePath,
    request: { scope: 'test' },
    createdAt: new Date().toISOString(),
  })

  it('UT-1.1.4: should enqueue jobs and assign queue positions in strict FIFO order', () => {
    const jobA = createJob('Job-A', '/workspace/alpha')
    const jobB = createJob('Job-B', '/workspace/beta')

    queue.enqueue(jobA)
    queue.enqueue(jobB)

    expect(queue.getQueuePosition('Job-A')).toBe(1)
    expect(queue.getQueuePosition('Job-B')).toBe(2)
    expect(queue.getPendingJobs()).toHaveLength(2)
  })

  it('UT-1.1.5: should emit worker notification signal and dequeue head job when lock released', async () => {
    const job = createJob('Job-A', '/workspace/project-1')
    await lockManager.acquire('/workspace/project-1', 'existing-job')

    queue.enqueue(job)

    const notifyHandler = vi.fn()
    queue.on('workerNotify', notifyHandler)

    await lockManager.release('/workspace/project-1', 'existing-job')
    queue.notifyLockReleased('/workspace/project-1')

    expect(notifyHandler).toHaveBeenCalled()

    const dequeuedJob = await queue.dequeueNextAvailable(lockManager)
    expect(dequeuedJob?.jobId).toBe('Job-A')
  })

  it('UT-1.1.6: should dequeue jobs targeting unlocked workspaces independently of blocked jobs', async () => {
    const jobA = createJob('Job-A', '/workspace/alpha')
    const jobB = createJob('Job-B', '/workspace/beta')

    await lockManager.acquire('/workspace/alpha', 'blocker-job')

    queue.enqueue(jobA)
    queue.enqueue(jobB)

    expect(queue.getQueuePosition('Job-A')).toBe(1)
    expect(queue.getQueuePosition('Job-B')).toBe(2)

    const nextJob = await queue.dequeueNextAvailable(lockManager)

    expect(nextJob?.jobId).toBe('Job-B')
    expect(queue.getPendingJobs()).toHaveLength(1)
    expect(queue.getQueuePosition('Job-A')).toBe(1)
  })

  it('should return -1 for queue position if job is not in queue', () => {
    expect(queue.getQueuePosition('non-existent')).toBe(-1)
  })

  it('should dequeue in FIFO order when no locks are present', () => {
    const jobA = createJob('Job-A', '/workspace/a')
    const jobB = createJob('Job-B', '/workspace/b')

    queue.enqueue(jobA)
    queue.enqueue(jobB)

    expect(queue.dequeue()).toEqual(jobA)
    expect(queue.dequeue()).toEqual(jobB)
    expect(queue.dequeue()).toBeUndefined()
  })

  it('should clear queue completely when clear is called', () => {
    queue.enqueue(createJob('Job-1', '/ws/1'))
    queue.enqueue(createJob('Job-2', '/ws/2'))

    queue.clear()

    expect(queue.getPendingJobs()).toHaveLength(0)
    expect(queue.size).toBe(0)
  })
})
