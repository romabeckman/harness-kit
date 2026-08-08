import { describe, it, expect, beforeEach } from 'vitest'
import { JobQueue } from '../JobQueue'
import { WorkspaceLockManager } from '../../mutex/WorkspaceLockManager'
import type { OrchestrationJob } from '../../../../domain/types'

describe('JobQueue', () => {
  let queue: JobQueue
  let lockManager: WorkspaceLockManager

  beforeEach(() => {
    queue = new JobQueue()
    lockManager = new WorkspaceLockManager()
  })

  it('UT-1.1.4: Enqueues jobs in FIFO order', () => {
    const job1: OrchestrationJob = {
      jobId: 'q-1',
      status: 'queued',
      workspacePath: '/ws/1',
      request: { idempotencyKey: 'id-q1', scope: 's1', project: 'backend', agent: 'claude-cli' },
      createdAt: new Date().toISOString(),
    }
    const job2: OrchestrationJob = {
      jobId: 'q-2',
      status: 'queued',
      workspacePath: '/ws/2',
      request: { idempotencyKey: 'id-q2', scope: 's2', project: 'backend', agent: 'claude-cli' },
      createdAt: new Date().toISOString(),
    }

    queue.enqueue(job1)
    queue.enqueue(job2)

    expect(queue.size).toBe(2)
    expect(queue.dequeue()?.jobId).toBe('q-1')
    expect(queue.dequeue()?.jobId).toBe('q-2')
  })

  it('UT-1.1.5: Reports queue position accurately', () => {
    const job1: OrchestrationJob = { jobId: 'pos-1', status: 'queued', workspacePath: '/ws', request: { idempotencyKey: 'id-pos1', scope: 's', project: 'backend', agent: 'claude-cli' }, createdAt: '' }
    const job2: OrchestrationJob = { jobId: 'pos-2', status: 'queued', workspacePath: '/ws', request: { idempotencyKey: 'id-pos2', scope: 's', project: 'backend', agent: 'claude-cli' }, createdAt: '' }

    queue.enqueue(job1)
    queue.enqueue(job2)

    expect(queue.getQueuePosition('pos-1')).toBe(1)
    expect(queue.getQueuePosition('pos-2')).toBe(2)
    expect(queue.getQueuePosition('pos-missing')).toBe(-1)
  })

  it('UT-1.1.6: Skips locked workspaces when dequeuing available jobs', async () => {
    const job1: OrchestrationJob = { jobId: 'lock-ws1', status: 'queued', workspacePath: '/ws/locked', request: { idempotencyKey: 'id-l1', scope: 's', project: 'backend', agent: 'claude-cli' }, createdAt: '' }
    const job2: OrchestrationJob = { jobId: 'free-ws2', status: 'queued', workspacePath: '/ws/free', request: { idempotencyKey: 'id-f2', scope: 's', project: 'backend', agent: 'claude-cli' }, createdAt: '' }

    await lockManager.acquireLock('/ws/locked', 'existing-job')

    queue.enqueue(job1)
    queue.enqueue(job2)

    const nextAvailable = await queue.dequeueNextAvailable(lockManager)
    expect(nextAvailable?.jobId).toBe('free-ws2')
    expect(queue.size).toBe(1)
  })
})
