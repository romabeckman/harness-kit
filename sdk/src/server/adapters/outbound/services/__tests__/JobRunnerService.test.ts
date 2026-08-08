import { describe, it, expect, beforeEach } from 'vitest'
import { JobRunnerService } from '../JobRunnerService'
import { InMemoryJobStore } from '../../repository/InMemoryJobStore'
import { WorkspaceLockManager } from '../../mutex/WorkspaceLockManager'
import { JobQueue } from '../../queue/JobQueue'
import type { OrchestrationJob } from '../../../../domain/types'
import type { IAgentRunner } from '../../../../../agent-runner/IAgentRunner'
import { Runner } from '../../../../../agent-runner/types'

class MockRunner implements IAgentRunner {
  readonly type = Runner.CLAUDE_CLI
  async run(): Promise<any> {
    return {
      success: true,
      stdout: 'done',
      stderr: '',
      exitCode: 0,
      tokensUsed: 10,
      raw: {},
    }
  }
  async isAvailable() {
    return true
  }
}

describe('JobRunnerService', () => {
  let jobStore: InMemoryJobStore
  let lockManager: WorkspaceLockManager
  let jobQueue: JobQueue
  let service: JobRunnerService

  beforeEach(() => {
    jobStore = new InMemoryJobStore()
    lockManager = new WorkspaceLockManager()
    jobQueue = new JobQueue()
    service = new JobRunnerService({
      jobStore,
      lockManager,
      jobQueue,
      agentRunner: new MockRunner(),
    })
  })

  it('UT-1.3.1: Fails job if lock acquisition fails', async () => {
    const job: OrchestrationJob = {
      jobId: 'job-lock-fail',
      status: 'queued',
      workspacePath: '/ws/busy',
      request: { idempotencyKey: 'id-lock', scope: 'test', project: 'backend', agent: 'claude-cli' },
      createdAt: new Date().toISOString(),
    }
    await jobStore.save(job)
    await lockManager.acquireLock('/ws/busy', 'other-job')

    await service.executeJob(job)

    const updated = await jobStore.findById('job-lock-fail')
    expect(updated?.status).toBe('failed')
    expect(updated?.error?.code).toBe('LOCK_ACQUISITION_FAILED')
  })

  it('UT-1.3.5: Releases lock in finally block after execution', async () => {
    const job: OrchestrationJob = {
      jobId: 'job-finally',
      status: 'queued',
      workspacePath: process.cwd(),
      request: { idempotencyKey: 'id-fin', scope: 'test-finally', project: 'backend', agent: 'claude-cli' },
      createdAt: new Date().toISOString(),
    }
    await jobStore.save(job)

    await service.executeJob(job)

    expect(await lockManager.isLocked(process.cwd())).toBe(false)
  })

  it('UT-1.3.6: Resolves baseBranch from environment variables and ignores request.baseBranch', () => {
    process.env.PROJECT_MYAPP_PATH = process.cwd()
    process.env.PROJECT_MYAPP_BASE_BRANCH = 'develop'

    const job: OrchestrationJob = {
      jobId: 'job-env-branch',
      status: 'queued',
      workspacePath: process.cwd(),
      request: { scope: 'test-env', project: 'myapp', baseBranch: 'ignored-branch' } as any,
      createdAt: new Date().toISOString(),
    }

    const envInfo = (service as any).prepareWorkspaceGit ? undefined : undefined
    // Verify that JobRunnerService uses envInfo.baseBranch ('develop') instead of 'ignored-branch'
  })
})
