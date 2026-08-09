import { existsSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import spawn from 'cross-spawn'
import type { JobStoreRepository } from '../../adapters/outbound/repository/JobStoreRepository'
import type { HttpServerConfig } from '../../domain/types'

export interface CleanResultVo {
  purgedJobs: number
  cleanedWorktrees: number
}

export class CleanJobsAndWorktreesUseCase {
  private static pendingCleanups = new Set<Promise<number>>()

  constructor(
    private jobStore: JobStoreRepository,
    private config?: HttpServerConfig
  ) {}

  async execute(maxAgeMs: number = 0): Promise<CleanResultVo> {
    const purgedJobs = await this.jobStore.purgeCompleted(maxAgeMs)
    const allowedWorkspaces = this.config?.allowedWorkspaces ?? [process.cwd()]

    let syncCleanedCount = 0

    // Schedule background non-blocking worktree purge
    const cleanupTask = (async () => {
      let count = 0
      for (const ws of allowedWorkspaces) {
        const worktreesDir = join(ws, '.worktrees')
        if (existsSync(worktreesDir)) {
          try {
            const entries = readdirSync(worktreesDir)
            for (const entry of entries) {
              const entryPath = join(worktreesDir, entry)
              // Security: Verify entry path is within worktrees directory
              if (!entryPath.startsWith(worktreesDir)) continue
              try {
                spawn.sync('git', ['worktree', 'remove', '--force', entryPath], { cwd: ws, stdio: 'pipe' })
                if (existsSync(entryPath)) {
                  rmSync(entryPath, { recursive: true, force: true })
                }
                count++
              } catch {}
            }
            spawn.sync('git', ['worktree', 'prune'], { cwd: ws, stdio: 'pipe' })
          } catch {}
        }
      }
      return count
    })()

    CleanJobsAndWorktreesUseCase.pendingCleanups.add(cleanupTask)
    cleanupTask.finally(() => CleanJobsAndWorktreesUseCase.pendingCleanups.delete(cleanupTask))

    return {
      purgedJobs,
      cleanedWorktrees: syncCleanedCount,
    }
  }

  static async awaitPendingCleanups(): Promise<void> {
    await Promise.all(Array.from(CleanJobsAndWorktreesUseCase.pendingCleanups))
  }
}
