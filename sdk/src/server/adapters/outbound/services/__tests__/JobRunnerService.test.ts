import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { JobRunnerService } from '../JobRunnerService'
import { InMemoryJobStore } from '../../repository/InMemoryJobStore'
import { WorkspaceLockManager } from '../../mutex/WorkspaceLockManager'
import { JobQueue } from '../../queue/JobQueue'
import type { OrchestrationJob } from '../../../../domain/types'
import type { IAgentRunner } from '../../../../../agent-runner/IAgentRunner'
import { Runner, type AgentInvocation } from '../../../../../agent-runner/types'

const orchestratorRun = vi.fn(async () => {})
const backlog = vi.fn(() => [{ status: 'COMPLETED' }])
const orchestratorConfig = vi.fn()
const orchestratorSteering = vi.fn()
const activeFeature = vi.fn()
vi.mock('../../../../../orchestrator/HarnessOrchestrator', () => ({
  HarnessOrchestrator: class {
    fsm = { loadBacklog: backlog }
    config: unknown
    constructor(config: unknown) { this.config = config; orchestratorConfig(config) }
    run = orchestratorRun
    applySteeringActions = orchestratorSteering
    getActiveFeature = activeFeature
  },
}))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFile: (_file: string, _args: string[], _options: unknown, done: (error: null, result: object) => void) => {
    done(null, { stdout: '', stderr: '' })
  },
}))

class MockRunner implements IAgentRunner {
  readonly type = Runner.CLAUDE_CLI
  async run(_invocation: AgentInvocation, _options?: { signal?: AbortSignal }): Promise<any> {
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
  let runner: MockRunner

  beforeEach(() => {
    vi.clearAllMocks()
    jobStore = new InMemoryJobStore()
    lockManager = new WorkspaceLockManager()
    jobQueue = new JobQueue()
    runner = new MockRunner()
    service = new JobRunnerService({
      jobStore,
      lockManager,
      jobQueue,
      agentRunner: runner,
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

  async function prepareIsolatedJob() {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-job-'))
    const job: OrchestrationJob = { jobId: 'job-1', status: 'queued', workspacePath: workspace,
      request: { idempotencyKey: 'key', scope: 'task', project: 'backend', agent: 'claude-cli' }, createdAt: new Date().toISOString() }
    const worktree = join(workspace, '.worktrees', job.jobId)
    mkdirSync(worktree, { recursive: true })
    vi.spyOn(service as any, 'prepareWorkspaceGit').mockResolvedValue({ effectiveWorkspacePath: worktree, createdWorktreePath: worktree, branch: 'job-1' })
    const deploy = vi.spyOn(service as any, 'finalizeGitCommitPush').mockResolvedValue(undefined)
    await jobStore.save(job)
    return { workspace, worktree, job, deploy }
  }

  it('preserves per-job diagnostic artifacts independently of completed worktree cleanup', async () => {
    const { workspace, worktree, job } = await prepareIsolatedJob()
    try {
      const product = join(worktree, 'docs', 'product')
      const episode = join('project-dreaming', 'episodes', 'dc648fe0-36df-4d51-925a-9f61fa167ae9.json')
      const handoff = join('project-dreaming', 'handoffs', 'guidance.json')
      orchestratorRun.mockImplementationOnce(async () => {
        for (const artifact of [episode, handoff, 'diagnose-sessions.jsonl']) {
          mkdirSync(dirname(join(product, artifact)), { recursive: true })
          writeFileSync(join(product, artifact), artifact)
        }
      })

      await service.executeJob(job)

      expect((await jobStore.findById(job.jobId))?.status).toBe('completed')
      expect(existsSync(worktree)).toBe(false)
      for (const artifact of [episode, handoff, 'diagnose-sessions.jsonl']) {
        expect(readFileSync(join(workspace, '.harness-kit', 'job-artifacts', job.jobId, artifact), 'utf8')).toBe(artifact)
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('retains the original worktree and avoids deployment if diagnostic artifacts cannot be archived', async () => {
    const { workspace, worktree, job, deploy } = await prepareIsolatedJob()
    try {
      const product = join(worktree, 'docs', 'product')
      orchestratorRun.mockImplementationOnce(async () => {
        mkdirSync(product, { recursive: true })
        writeFileSync(join(product, 'diagnose-sessions.jsonl'), '{}')
      })
      writeFileSync(join(workspace, '.harness-kit'), 'archive storage unavailable')

      await service.executeJob(job)

      expect((await jobStore.findById(job.jobId))?.error?.code).toBe('ARTIFACT_ARCHIVE_FAILED')
      expect(existsSync(worktree)).toBe(true)
      expect(deploy).not.toHaveBeenCalled()
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('reports a pending refinement decision even if the development runner returned a generic failure', async () => {
    const { workspace, worktree, job, deploy } = await prepareIsolatedJob()
    try {
      const specs = join(worktree, 'docs', 'specs', 'orders')
      mkdirSync(specs, { recursive: true })
      writeFileSync(join(specs, 'TDD-OUTPUT.json'), JSON.stringify({
        featureId: 'F1', reworksCount: 0, status: 'FAILED', modifiedFiles: [],
        metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 },
        orientation_use: [{ orientation_id: 'approval', revision: 1, feature: 'feature:orders',
          decision: 'needs_refinement', reason: 'Choose the approval policy.', test_ref: 'SC-1' }],
      }))
      activeFeature.mockReturnValueOnce({ id: 'F1', domain: 'orders', reworks: 0 })
      orchestratorRun.mockRejectedValueOnce(new Error('Development agent failed before a verified TDD-OUTPUT.json was accepted.'))

      await service.executeJob(job)

      expect((await jobStore.findById(job.jobId))?.error).toMatchObject({
        code: 'REFINEMENT_REQUIRED', message: expect.stringContaining('SC-1'),
      })
      expect(existsSync(worktree)).toBe(true)
      expect(deploy).not.toHaveBeenCalled()
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('limits Project Dreaming and exposes its progress while the runner is active', async () => {
    const { workspace, job } = await prepareIsolatedJob()
    try {
      const invocation = { agent: 'architect', skill: 'harness-kit:project-dreaming', timeoutMs: 3_600_000 } as AgentInvocation
      const originalSignal = new AbortController().signal
      const observed = vi.spyOn(runner, 'run').mockImplementation(async () => ({
        progress: (await jobStore.findById(job.jobId))?.progress?.phase,
      }))
      let progress: string | undefined
      orchestratorRun.mockImplementationOnce(async () => {
        progress = (await orchestratorConfig.mock.lastCall?.[0].agentRunner.run(invocation, { signal: originalSignal })).progress
      })

      await service.executeJob(job)

      expect(observed).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 120_000 }), { signal: expect.any(AbortSignal) })
      expect(observed.mock.calls[0]?.[1]?.signal).not.toBe(originalSignal)
      expect(progress).toBe('PROJECT_DREAMING')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('leaves a failed Memory phase resumable before deployment even after every feature passed', async () => {
    const { workspace, worktree, job, deploy } = await prepareIsolatedJob()
    try {
      vi.spyOn(runner, 'run').mockResolvedValue({ success: false })
      orchestratorRun.mockImplementationOnce(async () => {
        await orchestratorConfig.mock.lastCall?.[0].agentRunner.run({ agent: 'architect', phaseKey: 'memory', skill: 'harness-kit:project-memory' })
      })

      await service.executeJob(job)

      expect((await jobStore.findById(job.jobId))?.error?.code).toBe('MEMORY_FAILED')
      expect(existsSync(worktree)).toBe(true)
      expect(deploy).not.toHaveBeenCalled()
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('blocks deployment when the orchestration loop stops after a Memory timeout', async () => {
    const { workspace, job, deploy } = await prepareIsolatedJob()
    try {
      const controller = new AbortController()
      vi.spyOn(runner, 'run').mockImplementation(async () => {
        controller.abort()
        throw new Error('Agent timed out')
      })
      orchestratorRun.mockImplementationOnce(async () => {
        try {
          await orchestratorConfig.mock.lastCall?.[0].agentRunner.run(
            { agent: 'architect', phaseKey: 'memory', skill: 'harness-kit:project-memory' },
            { signal: controller.signal },
          )
        } catch {
          // The core returns after a timeout even if the backlog is complete.
        }
      })

      await service.executeJob(job)

      expect((await jobStore.findById(job.jobId))?.error?.code).toBe('MEMORY_FAILED')
      expect(deploy).not.toHaveBeenCalled()
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

})
