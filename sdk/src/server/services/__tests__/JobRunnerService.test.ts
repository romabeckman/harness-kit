import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { JobRunnerService } from '../JobRunnerService'
import { InMemoryJobStore } from '../../repository/InMemoryJobStore'
import { WorkspaceLockManager } from '../../mutex/WorkspaceLockManager'
import { JobQueue } from '../../queue/JobQueue'
import type { OrchestrationJob } from '../../types'
import { NullAgentRunner } from '../../../agent-runner/NullAgentRunner'
import { HarnessOrchestrator } from '../../../orchestrator/HarnessOrchestrator'
import spawn from 'cross-spawn'

vi.mock('../../../orchestrator/HarnessOrchestrator')
vi.mock('cross-spawn', () => ({
  default: {
    sync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
  },
}))

describe('JobRunnerService', () => {
  let jobStore: InMemoryJobStore
  let lockManager: WorkspaceLockManager
  let jobQueue: JobQueue
  let service: JobRunnerService

  beforeEach(() => {
    vi.clearAllMocks()
    jobStore = new InMemoryJobStore()
    lockManager = new WorkspaceLockManager()
    jobQueue = new JobQueue()
    service = new JobRunnerService(jobStore, lockManager, jobQueue)
  })

  afterEach(() => {
    service.stopWorkerLoop()
  })

  describe('UT-1.3.1: Mandatory lock acquisition', () => {
    it('acquires workspace lock before executing job and releases it after execution', async () => {
      const runMock = vi.fn().mockResolvedValue(undefined)
      vi.mocked(HarnessOrchestrator).mockImplementation(function (this: any) {
        this.run = runMock
        return this
      } as any)

      const job: OrchestrationJob = {
        jobId: 'job-101',
        status: 'queued',
        workspacePath: '/tmp/workspace-1',
        request: { scope: 'test' },
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job)

      const acquireSpy = vi.spyOn(lockManager, 'acquireLock')
      const releaseSpy = vi.spyOn(lockManager, 'releaseLock')

      await service.executeJob(job)

      expect(acquireSpy).toHaveBeenCalledWith('/tmp/workspace-1', 'job-101')
      expect(releaseSpy).toHaveBeenCalledWith('/tmp/workspace-1', 'job-101')
      expect(await lockManager.isLocked('/tmp/workspace-1')).toBe(false)
    })

    it('fails job status if lock cannot be acquired because workspace is locked', async () => {
      await lockManager.acquireLock('/tmp/workspace-locked', 'other-job')

      const job: OrchestrationJob = {
        jobId: 'job-102',
        status: 'queued',
        workspacePath: '/tmp/workspace-locked',
        request: { scope: 'test' },
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job)
      await service.executeJob(job)

      const updated = await jobStore.findById('job-102')
      expect(updated?.status).toBe('failed')
      expect(updated?.error?.code).toBe('LOCK_ACQUISITION_FAILED')
    })
  })

  describe('UT-1.3.2: Non-interactive orchestrator instantiation', () => {
    it('instantiates HarnessOrchestrator with NullAgentRunner when no runner supplied', async () => {
      const runMock = vi.fn().mockResolvedValue(undefined)
      vi.mocked(HarnessOrchestrator).mockImplementation(function (this: any, config: any) {
        expect(config.agentRunner).toBeInstanceOf(NullAgentRunner)
        this.run = runMock
        return this
      } as any)

      const job: OrchestrationJob = {
        jobId: 'job-201',
        status: 'queued',
        workspacePath: '/tmp/workspace-2',
        request: { scope: 'non-interactive-test' },
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job)
      await service.executeJob(job)

      expect(HarnessOrchestrator).toHaveBeenCalled()
      expect(runMock).toHaveBeenCalled()
    })
  })

  describe('UT-1.3.3: Status transition on success', () => {
    it('transitions job status from queued -> running -> completed', async () => {
      const statusTransitions: string[] = []
      const originalUpdateStatus = jobStore.updateStatus.bind(jobStore)
      vi.spyOn(jobStore, 'updateStatus').mockImplementation(async (jobId, status, error) => {
        statusTransitions.push(status)
        return originalUpdateStatus(jobId, status, error)
      })

      const runMock = vi.fn().mockImplementation(async () => {
        const currentJob = await jobStore.findById('job-301')
        expect(currentJob?.status).toBe('running')
      })
      vi.mocked(HarnessOrchestrator).mockImplementation(function (this: any) {
        this.run = runMock
        return this
      } as any)

      const job: OrchestrationJob = {
        jobId: 'job-301',
        status: 'queued',
        workspacePath: '/tmp/workspace-3',
        request: { scope: 'status-test' },
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job)
      await service.executeJob(job)

      expect(statusTransitions).toEqual(['running', 'completed'])
      const finalJob = await jobStore.findById('job-301')
      expect(finalJob?.status).toBe('completed')
    })
  })

  describe('UT-1.3.4: Exception trapping & failure status', () => {
    it('traps exceptions from orchestrator and sets job status to failed with error details', async () => {
      const runMock = vi.fn().mockRejectedValue(new Error('Orchestrator failed'))
      vi.mocked(HarnessOrchestrator).mockImplementation(function (this: any) {
        this.run = runMock
        return this
      } as any)

      const job: OrchestrationJob = {
        jobId: 'job-401',
        status: 'queued',
        workspacePath: '/tmp/workspace-4',
        request: { scope: 'error-test' },
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job)
      await service.executeJob(job)

      const finalJob = await jobStore.findById('job-401')
      expect(finalJob?.status).toBe('failed')
      expect(finalJob?.error?.code).toBe('JOB_EXECUTION_FAILED')
      expect(finalJob?.error?.message).toBe('Orchestrator failed')
    })
  })

  describe('UT-1.3.5: Guaranteed lock release in finally block', () => {
    it('guarantees workspace lock is released and notification emitted even when orchestrator throws', async () => {
      const runMock = vi.fn().mockRejectedValue(new Error('Fatal boom'))
      vi.mocked(HarnessOrchestrator).mockImplementation(function (this: any) {
        this.run = runMock
        return this
      } as any)

      const notifySpy = vi.spyOn(jobQueue, 'notifyLockReleased')

      const job: OrchestrationJob = {
        jobId: 'job-501',
        status: 'queued',
        workspacePath: '/tmp/workspace-5',
        request: { scope: 'finally-test' },
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job)
      await service.executeJob(job)

      expect(await lockManager.isLocked('/tmp/workspace-5')).toBe(false)
      expect(notifySpy).toHaveBeenCalledWith('/tmp/workspace-5')
    })
  })

  describe('UT-1.3.6: Git branch checkout & cloning', () => {
    it('supports branch parameter in request and executes git checkout', async () => {
      const runMock = vi.fn().mockResolvedValue(undefined)
      vi.mocked(HarnessOrchestrator).mockImplementation(function (this: any) {
        this.run = runMock
        return this
      } as any)

      const job: OrchestrationJob = {
        jobId: 'job-601',
        status: 'queued',
        workspacePath: __dirname,
        request: { scope: 'branch-test', branch: 'feature/remote-checkout' },
        createdAt: new Date().toISOString(),
      }

      await jobStore.save(job)
      await service.executeJob(job)

      const finalJob = await jobStore.findById('job-601')
      expect(finalJob?.status).toBe('completed')
      expect(spawn.sync).toHaveBeenCalledWith('git', ['checkout', 'feature/remote-checkout'], expect.anything())
    })
  })
})
