import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryJobStore } from '../InMemoryJobStore'
import type { OrchestrationJob } from '../../../../domain/types'

describe('InMemoryJobStore', () => {
  let jobStore: InMemoryJobStore

  beforeEach(() => {
    jobStore = new InMemoryJobStore()
  })

    const dummyReq = { idempotencyKey: 'idemp-test', scope: 'test', project: 'backend', agent: 'claude-cli' }

    it('IT-2.1.1: Saves and finds job by ID', async () => {
      const job: OrchestrationJob = {
        jobId: 'job-100',
        status: 'queued',
        workspacePath: '/workspace/app',
        request: dummyReq,
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job)
      const found = await jobStore.findById('job-100')
      expect(found).not.toBeNull()
      expect(found?.jobId).toBe('job-100')
      expect(found?.status).toBe('queued')
    })

    it('IT-2.1.2: Updates job status and sets timestamps', async () => {
      const job: OrchestrationJob = {
        jobId: 'job-200',
        status: 'queued',
        workspacePath: '/workspace/app',
        request: dummyReq,
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job)
      await jobStore.updateStatus('job-200', 'running')

      let updated = await jobStore.findById('job-200')
      expect(updated?.status).toBe('running')
      expect(updated?.startedAt).toBeDefined()

      await jobStore.updateStatus('job-200', 'completed')
      updated = await jobStore.findById('job-200')
      expect(updated?.status).toBe('completed')
      expect(updated?.completedAt).toBeDefined()
    })

    it('IT-2.1.3: Lists only active (queued/running) jobs', async () => {
      const job1: OrchestrationJob = {
        jobId: 'job-1',
        status: 'queued',
        workspacePath: '/workspace/a',
        request: dummyReq,
        createdAt: new Date().toISOString(),
      }
      const job2: OrchestrationJob = {
        jobId: 'job-2',
        status: 'running',
        workspacePath: '/workspace/b',
        request: dummyReq,
        createdAt: new Date().toISOString(),
      }
      const job3: OrchestrationJob = {
        jobId: 'job-3',
        status: 'completed',
        workspacePath: '/workspace/c',
        request: dummyReq,
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job1)
      await jobStore.save(job2)
      await jobStore.save(job3)

      const active = await jobStore.listActive()
      expect(active.length).toBe(2)
      expect(active.map((j) => j.jobId)).toEqual(['job-1', 'job-2'])
    })

    it('Deletes job by ID', async () => {
      const job: OrchestrationJob = {
        jobId: 'job-del',
        status: 'queued',
        workspacePath: '/tmp',
        request: dummyReq,
        createdAt: new Date().toISOString(),
      }
      await jobStore.save(job)
      const deleted = await jobStore.delete('job-del')
      expect(deleted).toBe(true)
      expect(await jobStore.findById('job-del')).toBeNull()
    })

    it('Purges completed jobs', async () => {
      const job: OrchestrationJob = {
        jobId: 'job-purge',
        status: 'completed',
        workspacePath: '/tmp',
        request: dummyReq,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }
      await jobStore.save(job)
      const count = await jobStore.purgeCompleted(0)
      expect(count).toBe(1)
      expect(await jobStore.findById('job-purge')).toBeNull()
    })

    it('Evicts oldest jobs when maxJobs capacity is reached', async () => {
      const limitedStore = new InMemoryJobStore({ maxJobs: 2 })
      await limitedStore.save({ jobId: 'j1', status: 'completed', workspacePath: '/tmp', request: dummyReq, createdAt: new Date().toISOString() })
      await limitedStore.save({ jobId: 'j2', status: 'running', workspacePath: '/tmp', request: dummyReq, createdAt: new Date().toISOString() })
      await limitedStore.save({ jobId: 'j3', status: 'queued', workspacePath: '/tmp', request: dummyReq, createdAt: new Date().toISOString() })

      expect(await limitedStore.findById('j1')).toBeNull()
      expect(await limitedStore.findById('j2')).not.toBeNull()
      expect(await limitedStore.findById('j3')).not.toBeNull()
    })

    it('Finds job by idempotencyKey', async () => {
      const job: OrchestrationJob = {
        jobId: 'job-idem-1',
        idempotencyKey: 'idem-key-999',
        status: 'queued',
        workspacePath: '/tmp/ws',
        request: dummyReq,
        createdAt: new Date().toISOString(),
      }
      await jobStore.save(job)
      const found = await jobStore.findByIdempotencyKey('idem-key-999')
      expect(found).not.toBeNull()
      expect(found?.jobId).toBe('job-idem-1')
      expect(found?.idempotencyKey).toBe('idem-key-999')

      expect(await jobStore.findByIdempotencyKey('non-existent')).toBeNull()
    })
})
