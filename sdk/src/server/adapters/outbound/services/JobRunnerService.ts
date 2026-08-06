import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import spawn from 'cross-spawn'
import type { JobStoreRepository } from '../repository/JobStoreRepository'
import type { WorkspaceLockManager } from '../mutex/WorkspaceLockManager'
import type { JobQueue } from '../queue/JobQueue'
import type { OrchestrationJob } from '../../../domain/types'
import type { IAgentRunner } from '../../../../agent-runner/IAgentRunner'
import { NullAgentRunner } from '../../../../agent-runner/NullAgentRunner'
import { AgentRunnerFactory } from '../../../../agent-runner/AgentRunnerFactory'
import { DtoMappers } from '../../inbound/http/mappers/DtoMappers'
import { HarnessOrchestrator } from '../../../../orchestrator/HarnessOrchestrator'
import { FileStateManager } from '../../../../file-state/FileStateManager'

export interface JobRunnerServiceOptions {
  jobStore: JobStoreRepository
  lockManager: WorkspaceLockManager
  jobQueue: JobQueue
  agentRunner?: IAgentRunner
}

export class JobRunnerService {
  private jobStore: JobStoreRepository
  private lockManager: WorkspaceLockManager
  private jobQueue: JobQueue
  private agentRunner?: IAgentRunner
  private isRunning = false
  private workerListener?: () => void

  constructor(
    jobStoreOrOptions: JobStoreRepository | JobRunnerServiceOptions,
    lockManager?: WorkspaceLockManager,
    jobQueue?: JobQueue,
    options?: { agentRunner?: IAgentRunner }
  ) {
    if ('jobStore' in jobStoreOrOptions) {
      this.jobStore = jobStoreOrOptions.jobStore
      this.lockManager = jobStoreOrOptions.lockManager
      this.jobQueue = jobStoreOrOptions.jobQueue
      this.agentRunner = jobStoreOrOptions.agentRunner
    } else {
      this.jobStore = jobStoreOrOptions
      this.lockManager = lockManager!
      this.jobQueue = jobQueue!
      this.agentRunner = options?.agentRunner
    }
  }

  /**
   * Executes a single orchestration job.
   */
  async executeJob(job: OrchestrationJob): Promise<void> {
    const acquired = await this.lockManager.acquireLock(job.workspacePath, job.jobId)
    if (!acquired) {
      await this.jobStore.updateStatus(job.jobId, 'failed', {
        code: 'LOCK_ACQUISITION_FAILED',
        message: `Could not acquire workspace lock for path: ${job.workspacePath}`,
      })
      return
    }

    let createdWorktreePath: string | undefined

    try {
      await this.jobStore.updateStatus(job.jobId, 'running')

      const gitPrep = await this.prepareWorkspaceGit(job.workspacePath, job.request, job.jobId)
      const effectivePath = gitPrep.effectiveWorkspacePath
      createdWorktreePath = gitPrep.createdWorktreePath

      // Resolve action (reset vs resume) using FileStateManager if action is omitted (IT-2.3.2)
      let action = job.request.action
      const productDir = join(effectivePath, 'docs', 'product')
      if (!action) {
        const fsm = new FileStateManager({ productDir, workingDir: effectivePath })
        const hasExistingSession = fsm.existBootstrapConfig() && fsm.existScope()
        action = hasExistingSession ? 'resume' : 'reset'
      }

      if (action === 'reset' && existsSync(productDir)) {
        rmSync(productDir, { recursive: true, force: true })
      }

      const orchestratorConfig = DtoMappers.toOrchestratorConfig(job.request, effectivePath)

      const runner =
        this.agentRunner ??
        (job.request.agent
          ? AgentRunnerFactory.create({
              type: job.request.agent,
              model: job.request.model,
              effort: job.request.effort,
            })
          : new NullAgentRunner())

      orchestratorConfig.agentRunner = runner

      const orchestrator = new HarnessOrchestrator(orchestratorConfig, {
        workingDir: effectivePath,
      })

      await orchestrator.run()

      // Commit and push completed changes before cleaning up worktree
      const targetBranch = job.request.branch ?? `job-${job.jobId}`
      await this.finalizeGitCommitPush(effectivePath, targetBranch, job.request.scope, job.jobId)

      await this.jobStore.updateStatus(job.jobId, 'completed')
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err)
      const code = err && typeof err.code === 'string' ? err.code : 'JOB_EXECUTION_FAILED'
      await this.jobStore.updateStatus(job.jobId, 'failed', { code, message })
    } finally {
      if (createdWorktreePath) {
        try {
          spawn.sync('git', ['worktree', 'remove', '--force', createdWorktreePath], { cwd: job.workspacePath, stdio: 'pipe' })
          if (existsSync(createdWorktreePath)) {
            rmSync(createdWorktreePath, { recursive: true, force: true })
          }
        } catch {}
      }
      await this.lockManager.releaseLock(job.workspacePath, job.jobId)
      this.jobQueue.notifyLockReleased(job.workspacePath)
    }
  }

  /**
   * Prepares workspace git repository using mandatory Git worktree isolation by default.
   */
  private async prepareWorkspaceGit(
    workspacePath: string,
    request: OrchestrationJob['request'],
    jobId: string
  ): Promise<{ effectiveWorkspacePath: string; createdWorktreePath?: string }> {
    const useWorktree = request.useWorktree ?? true

    const firstProject = typeof request.project === 'string'
      ? request.project
      : (Array.isArray(request.project) && request.project.length > 0 ? request.project[0] : undefined)

    const envInfo = DtoMappers.resolveProjectFromEnv(firstProject)
    const gitUrl = envInfo?.gitUrl

    if (gitUrl && !existsSync(join(workspacePath, '.git'))) {
      const res = spawn.sync('git', ['clone', gitUrl, workspacePath], { stdio: 'pipe', encoding: 'utf-8' })
      if (res.status !== 0) {
        throw new Error(`Git clone failed for '${gitUrl}': ${res.stderr || res.stdout}`)
      }
    }

    if (useWorktree && existsSync(join(workspacePath, '.git'))) {
      const worktreePath = join(workspacePath, '.worktrees', jobId)
      const targetBranch = request.branch ?? `job-${jobId}`
      const addRes = spawn.sync('git', ['worktree', 'add', '-B', targetBranch, worktreePath], { cwd: workspacePath, stdio: 'pipe', encoding: 'utf-8' })
      if (addRes.status === 0) {
        return { effectiveWorkspacePath: worktreePath, createdWorktreePath: worktreePath }
      }
    }

    if (request.branch && existsSync(workspacePath)) {
      const checkoutRes = spawn.sync('git', ['checkout', request.branch], { cwd: workspacePath, stdio: 'pipe', encoding: 'utf-8' })
      if (checkoutRes.status !== 0) {
        const createRes = spawn.sync('git', ['checkout', '-B', request.branch], { cwd: workspacePath, stdio: 'pipe', encoding: 'utf-8' })
        if (createRes.status !== 0) {
          throw new Error(`Git checkout failed for branch '${request.branch}': ${checkoutRes.stderr || createRes.stderr}`)
        }
      }
    }

    return { effectiveWorkspacePath: workspacePath }
  }

  /**
   * Commits all uncommitted workspace changes and pushes the branch to remote origin upon job completion.
   */
  private async finalizeGitCommitPush(
    workingDir: string,
    branch: string,
    scope?: string,
    jobId?: string
  ): Promise<void> {
    if (!existsSync(join(workingDir, '.git')) && !existsSync(workingDir)) return

    try {
      const statusRes = spawn.sync('git', ['status', '--porcelain'], { cwd: workingDir, stdio: 'pipe', encoding: 'utf-8' })
      const hasChanges = statusRes.stdout && statusRes.stdout.trim().length > 0

      if (hasChanges) {
        spawn.sync('git', ['add', '-A'], { cwd: workingDir, stdio: 'pipe' })
        const commitMsg = `feat(harness): completed orchestration job ${jobId ?? ''} [${scope ?? 'auto'}]`
        spawn.sync('git', ['commit', '-m', commitMsg], { cwd: workingDir, stdio: 'pipe' })
      }

      // Push committed changes to origin
      spawn.sync('git', ['push', 'origin', branch], { cwd: workingDir, stdio: 'pipe' })
    } catch {
      // Git commit or push errors inside background worker do not block job completion record
    }
  }

  /**
   * Starts the background worker loop to continuously dequeue and run jobs from JobQueue.
   */
  startWorkerLoop(): void {
    if (this.isRunning) return
    this.isRunning = true

    const processNext = async () => {
      if (!this.isRunning) return
      const nextJob = await this.jobQueue.dequeueNextAvailable(this.lockManager)
      if (nextJob) {
        await this.executeJob(nextJob)
        if (this.isRunning && this.jobQueue.size > 0) {
          setImmediate(processNext)
        }
      }
    }

    this.workerListener = () => {
      processNext()
    }

    this.jobQueue.on('workerNotify', this.workerListener)
    processNext()
  }

  /**
   * Stops the background worker loop.
   */
  stopWorkerLoop(): void {
    this.isRunning = false
    if (this.workerListener) {
      this.jobQueue.off('workerNotify', this.workerListener)
      this.workerListener = undefined
    }
  }
}
