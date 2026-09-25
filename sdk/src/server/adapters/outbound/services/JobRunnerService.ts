import { existsSync, rmSync, copyFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
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
import { findSensitiveGitPaths } from '../../../../orchestrator/utils/GitSensitiveFiles'

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

import { AsyncWorkerPool } from './AsyncWorkerPool'

export interface JobRunnerServiceOptions {
  jobStore: JobStoreRepository
  lockManager: WorkspaceLockManager
  jobQueue: JobQueue
  agentRunner?: IAgentRunner
  maxConcurrency?: number
}

export class JobRunnerService {
  private jobStore: JobStoreRepository
  private lockManager: WorkspaceLockManager
  private jobQueue: JobQueue
  private agentRunner?: IAgentRunner
  private workerPool: AsyncWorkerPool

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
      this.workerPool = new AsyncWorkerPool({
        maxConcurrency: jobStoreOrOptions.maxConcurrency,
        queue: this.jobQueue,
        lockManager: this.lockManager,
        jobStore: this.jobStore,
      })
    } else {
      this.jobStore = jobStoreOrOptions
      this.lockManager = lockManager!
      this.jobQueue = jobQueue!
      this.agentRunner = options?.agentRunner
      this.workerPool = new AsyncWorkerPool({
        queue: this.jobQueue,
        lockManager: this.lockManager,
        jobStore: this.jobStore,
      })
    }

    this.workerPool.setJobProcessor((job) => this.executeJob(job))
  }

  getWorkerPool(): AsyncWorkerPool {
    return this.workerPool
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
    let completed = false

    try {
      await this.jobStore.updateStatus(job.jobId, 'running')

      const gitPrep = await this.prepareWorkspaceGit(job.workspacePath, job.request, job.jobId, job.resumeFromJobId)
      const effectivePath = gitPrep.effectiveWorkspacePath
      createdWorktreePath = gitPrep.createdWorktreePath

      if (createdWorktreePath && createdWorktreePath !== job.workspacePath) {
        const rootSettingsFile = join(job.workspacePath, '.harness-kit', 'settings.json')
        const worktreeSettingsDir = join(createdWorktreePath, '.harness-kit')
        const worktreeSettingsFile = join(worktreeSettingsDir, 'settings.json')
        if (existsSync(rootSettingsFile) && !existsSync(worktreeSettingsFile)) {
          try {
            mkdirSync(worktreeSettingsDir, { recursive: true })
            copyFileSync(rootSettingsFile, worktreeSettingsFile)
          } catch {}
        }
      }

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

      if (action === 'resume' && job.request.steeringMessage?.trim()) {
        orchestrator.applySteeringActions([{ type: 'add_rule', rule: job.request.steeringMessage.trim() }])
      }

      await orchestrator.run()

      const features = orchestrator.fsm.loadBacklog()
      if (features.length === 0 || features.some(feature => feature.status !== 'COMPLETED')) {
        throw new Error('Orchestration halted before all features completed. Resume this job from its preserved worktree.')
      }

      // Commit and push completed changes before cleaning up worktree
      await this.finalizeGitCommitPush(effectivePath, gitPrep.branch, job.request.scope, job.jobId)

      await this.jobStore.updateStatus(job.jobId, 'completed')
      completed = true
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err)
      const code = err && typeof err.code === 'string' ? err.code : 'JOB_EXECUTION_FAILED'
      await this.jobStore.updateStatus(job.jobId, 'failed', { code, message })
    } finally {
      if (createdWorktreePath && completed) {
        this.syncWorktreeTelemetry(createdWorktreePath, job.workspacePath)
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
   * Synchronizes telemetry records from temporary worktree docs/product/tokens.jsonl to main workspace root.
   */
  private syncWorktreeTelemetry(worktreePath: string, mainWorkspacePath: string): void {
    if (!worktreePath || worktreePath === mainWorkspacePath) return

    const sourceFile = join(worktreePath, 'docs', 'product', 'tokens.jsonl')
    if (!existsSync(sourceFile)) return

    try {
      const content = readFileSync(sourceFile, 'utf-8').trim()
      if (!content) return

      const mainDir = join(mainWorkspacePath, 'docs', 'product')
      const mainFile = join(mainDir, 'tokens.jsonl')
      if (!existsSync(mainDir)) {
        mkdirSync(mainDir, { recursive: true })
      }

      const existingLines = new Set<string>()
      if (existsSync(mainFile)) {
        const existingContent = readFileSync(mainFile, 'utf-8')
        for (const line of existingContent.split(/\r?\n/)) {
          if (line.trim()) existingLines.add(line.trim())
        }
      }

      const newLines: string[] = []
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed && !existingLines.has(trimmed)) {
          newLines.push(trimmed)
          existingLines.add(trimmed)
        }
      }

      if (newLines.length > 0) {
        appendFileSync(mainFile, newLines.join('\n') + '\n', 'utf-8')
      }
    } catch (err) {
      console.warn(`Failed to sync worktree telemetry from ${sourceFile} to ${mainWorkspacePath}:`, err)
    }
  }

  /**
   * Prepares workspace git repository using mandatory Git worktree isolation by default.
   */
  private async prepareWorkspaceGit(
    workspacePath: string,
    request: OrchestrationJob['request'],
    jobId: string,
    resumeFromJobId?: string
  ): Promise<{ effectiveWorkspacePath: string; createdWorktreePath?: string; branch: string }> {
    if (resumeFromJobId) {
      const previousWorktreePath = join(workspacePath, '.worktrees', resumeFromJobId)
      if (!existsSync(previousWorktreePath)) {
        throw new Error(`Resume state for job '${resumeFromJobId}' is no longer available.`)
      }
      return { effectiveWorkspacePath: previousWorktreePath, createdWorktreePath: previousWorktreePath, branch: `job-${resumeFromJobId}` }
    }

    const firstProject = typeof request.project === 'string'
      ? request.project
      : (Array.isArray(request.project) && request.project.length > 0 ? request.project[0] : undefined)

    const envInfo = DtoMappers.resolveProjectFromEnv(firstProject)
    const gitUrl = envInfo?.gitUrl
    const baseBranch = envInfo?.baseBranch ?? process.env.BASE_BRANCH ?? 'main'

    if (gitUrl && !existsSync(join(workspacePath, '.git'))) {
      const cloneRes = await execGit(['clone', '-b', baseBranch, gitUrl, workspacePath])
      if (cloneRes.exitCode !== 0) {
        const fallbackClone = await execGit(['clone', gitUrl, workspacePath])
        if (fallbackClone.exitCode !== 0) {
          throw new Error(`Git clone failed for '${gitUrl}': ${fallbackClone.stderr || fallbackClone.stdout}`)
        }
      }
    }

    if (existsSync(join(workspacePath, '.git'))) {
      // JIT Sync: fetch latest changes from origin for baseBranch
      await execGit(['fetch', 'origin', baseBranch], workspacePath)
    }

    const targetBranch = `job-${jobId}`
    if (existsSync(join(workspacePath, '.git'))) {
      const worktreePath = join(workspacePath, '.worktrees', jobId)
      const addRes = await execGit(
        ['worktree', 'add', '-B', targetBranch, worktreePath, `origin/${baseBranch}`],
        workspacePath
      )
      if (addRes.exitCode === 0) {
        return { effectiveWorkspacePath: worktreePath, createdWorktreePath: worktreePath, branch: targetBranch }
      }
      throw new Error(`Git worktree creation failed: ${addRes.stderr || addRes.stdout}`)
    }
    throw new Error(`Workspace '${workspacePath}' is not a Git repository; an isolated worktree is required.`)
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
    if (statusRes.exitCode !== 0) throw new Error(`Git status failed: ${statusRes.stderr}`)
    const hasChanges = statusRes.stdout && statusRes.stdout.trim().length > 0

    if (hasChanges) {
      const addRes = await execGit(['add', '-A'], workingDir)
      if (addRes.exitCode !== 0) {
        const err: any = new Error(`Git add failed: ${addRes.stderr}`)
        err.code = 'GIT_COMMIT_FAILED'
        throw err
      }

      const staged = await execGit(['diff', '--cached', '--name-only'], workingDir)
      if (staged.exitCode !== 0) throw new Error(`Git staged-file inspection failed: ${staged.stderr}`)
      const sensitive = findSensitiveGitPaths(staged.stdout.split(/\r?\n/).filter(Boolean))
      if (sensitive.length > 0) {
        const err: any = new Error(`Security pre-check blocked commit: sensitive file(s) staged [${sensitive.join(', ')}].`)
        err.code = 'SENSITIVE_FILES_STAGED'
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
   * Starts the background worker pool to continuously dequeue and run jobs.
   */
  startWorkerLoop(): void {
    this.workerPool.start()
  }

  /**
   * Stops the background worker pool.
   */
  stopWorkerLoop(): void {
    this.workerPool.stop()
  }
}
