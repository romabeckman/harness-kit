import { describe, it, expect, beforeEach, vi } from 'vitest'
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

const orchestratorRun = vi.fn(async () => {})
const backlog = vi.fn(() => [{ status: 'COMPLETED' }])
const orchestratorConfig = vi.fn()
const orchestratorSteering = vi.fn()
vi.mock('../../../../../orchestrator/HarnessOrchestrator', () => ({
  HarnessOrchestrator: class {
    fsm = { loadBacklog: backlog }
    config: unknown
    constructor(config: unknown) { this.config = config; orchestratorConfig(config) }
    run = orchestratorRun
    applySteeringActions = orchestratorSteering
  },
}))

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
    vi.clearAllMocks()
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
      vi.spyOn(service as any, 'prepareWorkspaceGit').mockRejectedValue(new Error('simulated preparation failure'))
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

  it('marks a halted incomplete run failed and retains its resumable worktree', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-main-'))
    const worktree = join(workspace, '.worktrees', 'job-incomplete')
    mkdirSync(worktree, { recursive: true })
    const prepare = vi.spyOn(service as any, 'prepareWorkspaceGit').mockResolvedValue({ effectiveWorkspacePath: worktree, createdWorktreePath: worktree, branch: 'job-job-incomplete' })
    const deploy = vi.spyOn(service as any, 'finalizeGitCommitPush').mockResolvedValue(undefined)
    backlog.mockReturnValueOnce([{ status: 'IN_PROGRESS' }])
    const job: OrchestrationJob = { jobId: 'job-incomplete', status: 'queued', workspacePath: workspace,
      request: { idempotencyKey: 'incomplete', scope: 'task', project: 'backend', agent: 'claude-cli' }, createdAt: new Date().toISOString() }
    await jobStore.save(job)
    try {
      await service.executeJob(job)
      expect((await jobStore.findById(job.jobId))?.status).toBe('failed')
      expect(existsSync(worktree)).toBe(true)
      expect(deploy).not.toHaveBeenCalled()
      expect(prepare).toHaveBeenCalled()
      expect(orchestratorConfig.mock.lastCall?.[0].skipDeploy).toBe(true)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('reuses the previous worktree for resume without starting from the base branch', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-main-'))
    const previous = join(workspace, '.worktrees', 'old-job')
    mkdirSync(previous, { recursive: true })
    try {
      const prepared = await (service as any).prepareWorkspaceGit(workspace,
        { project: 'backend', agent: 'claude-cli', scope: 'task' }, 'new-job', 'old-job')
      expect(prepared.effectiveWorkspacePath).toBe(previous)
      expect(prepared.branch).toBe('job-old-job')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('applies resume steering to the persisted orchestrator state', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-steering-'))
    vi.spyOn(service as any, 'prepareWorkspaceGit').mockResolvedValue({ effectiveWorkspacePath: workspace, branch: 'job-old' })
    vi.spyOn(service as any, 'finalizeGitCommitPush').mockResolvedValue(undefined)
    const job: OrchestrationJob = { jobId: 'new', resumeFromJobId: 'old', status: 'queued', workspacePath: workspace,
      request: { idempotencyKey: 'resume-id', scope: 'task', project: 'backend', agent: 'claude-cli',
        action: 'resume', steeringMessage: 'Preserve compatibility' }, createdAt: new Date().toISOString() }
    await jobStore.save(job)
    try {
      await service.executeJob(job)
      expect(orchestratorSteering).toHaveBeenCalledWith([{ type: 'add_rule', rule: 'Preserve compatibility' }])
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

})
