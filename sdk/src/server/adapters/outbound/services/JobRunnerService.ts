import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
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

const execFileAsync = promisify(execFile)

async function execGit(
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
    })
    return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
      exitCode: typeof err.code === 'number' ? err.code : 1,
    }
  }
}

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
  private isLoopProcessing = false
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
          await execGit(['worktree', 'remove', '--force', createdWorktreePath], job.workspacePath)
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
      const cloneRes = await execGit(['clone', gitUrl, workspacePath])
      if (cloneRes.exitCode !== 0) {
        throw new Error(`Git clone failed for '${gitUrl}': ${cloneRes.stderr || cloneRes.stdout}`)
      }
    }

    if (useWorktree && existsSync(join(workspacePath, '.git'))) {
      const worktreePath = join(workspacePath, '.worktrees', jobId)
      const targetBranch = request.branch ?? `job-${jobId}`
      const addRes = await execGit(['worktree', 'add', '-B', targetBranch, worktreePath], workspacePath)
      if (addRes.exitCode === 0) {
        return { effectiveWorkspacePath: worktreePath, createdWorktreePath: worktreePath }
      }
    }

    if (request.branch && existsSync(workspacePath)) {
      const checkoutRes = await execGit(['checkout', request.branch], workspacePath)
      if (checkoutRes.exitCode !== 0) {
        const createRes = await execGit(['checkout', '-B', request.branch], workspacePath)
        if (createRes.exitCode !== 0) {
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

    const statusRes = await execGit(['status', '--porcelain'], workingDir)
    const hasChanges = statusRes.stdout && statusRes.stdout.trim().length > 0

    if (hasChanges) {
      const addRes = await execGit(['add', '-A'], workingDir)
      if (addRes.exitCode !== 0) {
        const err: any = new Error(`Git add failed: ${addRes.stderr}`)
        err.code = 'GIT_COMMIT_FAILED'
        throw err
      }

      const commitMsg = `feat(harness): completed orchestration job ${jobId ?? ''} [${scope ?? 'auto'}]`
      const commitRes = await execGit(['commit', '-m', commitMsg], workingDir)
      if (commitRes.exitCode !== 0) {
        const err: any = new Error(`Git commit failed: ${commitRes.stderr}`)
        err.code = 'GIT_COMMIT_FAILED'
        throw err
      }
    }

    // Push committed changes to origin
    const pushRes = await execGit(['push', 'origin', branch], workingDir)
    if (pushRes.exitCode !== 0) {
      const err: any = new Error(`Git push failed to branch '${branch}': ${pushRes.stderr || pushRes.stdout}`)
      err.code = 'GIT_PUSH_FAILED'
      throw err
    }
  }

  /**
   * Starts the background worker loop to continuously dequeue and run jobs from JobQueue.
   */
  startWorkerLoop(): void {
    if (this.isRunning) return
    this.isRunning = true

    const processNext = async () => {
      if (!this.isRunning || this.isLoopProcessing) return
      this.isLoopProcessing = true

      try {
        const nextJob = await this.jobQueue.dequeueNextAvailable(this.lockManager)
        if (nextJob) {
          await this.executeJob(nextJob)
          if (this.isRunning && this.jobQueue.size > 0) {
            setImmediate(processNext)
          }
        }
      } finally {
        this.isLoopProcessing = false
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
    this.isLoopProcessing = false
    if (this.workerListener) {
      this.jobQueue.off('workerNotify', this.workerListener)
      this.workerListener = undefined
    }
  }
}
