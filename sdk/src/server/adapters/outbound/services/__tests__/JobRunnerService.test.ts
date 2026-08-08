import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
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
    const testWs = mkdtempSync(join(tmpdir(), 'harness-test-'))
    try {
      const job: OrchestrationJob = {
        jobId: 'job-finally',
        status: 'queued',
        workspacePath: testWs,
        request: { idempotencyKey: 'id-fin', scope: 'test-finally', project: 'backend', agent: 'claude-cli' },
        createdAt: new Date().toISOString(),
      }
      await jobStore.save(job)

      await service.executeJob(job)

      expect(await lockManager.isLocked(testWs)).toBe(false)
    } finally {
      rmSync(testWs, { recursive: true, force: true })
    }
  })

  it('UT-1.3.7: Synchronizes telemetry tokens from worktree to main workspace', () => {
    const mainWs = mkdtempSync(join(tmpdir(), 'harness-main-'))
    const worktreeWs = mkdtempSync(join(tmpdir(), 'harness-worktree-'))
    try {
      const sourceDir = join(worktreeWs, 'docs', 'product')
      mkdirSync(sourceDir, { recursive: true })
      const sampleRecord = JSON.stringify({ model: 'claude-3-5-sonnet', inputTokens: 100, agent: 'claude-cli' }) + '\n'
      writeFileSync(join(sourceDir, 'tokens.jsonl'), sampleRecord, 'utf-8')

      ;(service as any).syncWorktreeTelemetry(worktreeWs, mainWs)

      const mainFile = join(mainWs, 'docs', 'product', 'tokens.jsonl')
      expect(existsSync(mainFile)).toBe(true)
      const content = readFileSync(mainFile, 'utf-8')
      expect(content).toContain('claude-3-5-sonnet')
    } finally {
      rmSync(mainWs, { recursive: true, force: true })
      rmSync(worktreeWs, { recursive: true, force: true })
    }
  })
})
