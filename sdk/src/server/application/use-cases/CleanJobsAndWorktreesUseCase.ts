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
  constructor(
    private jobStore: JobStoreRepository,
    private config?: HttpServerConfig
  ) {}

  async execute(maxAgeMs: number = 0): Promise<CleanResultVo> {
    const purgedJobs = await this.jobStore.purgeCompleted(maxAgeMs)
    let cleanedWorktrees = 0

    const allowedWorkspaces = this.config?.allowedWorkspaces ?? [process.cwd()]

    for (const ws of allowedWorkspaces) {
      const worktreesDir = join(ws, '.worktrees')
      if (existsSync(worktreesDir)) {
        try {
          const entries = readdirSync(worktreesDir)
          for (const entry of entries) {
            const entryPath = join(worktreesDir, entry)
            try {
              spawn.sync('git', ['worktree', 'remove', '--force', entryPath], { cwd: ws, stdio: 'pipe' })
              if (existsSync(entryPath)) {
                rmSync(entryPath, { recursive: true, force: true })
              }
              cleanedWorktrees++
            } catch {}
          }
          // Prune git worktree administrative files
          spawn.sync('git', ['worktree', 'prune'], { cwd: ws, stdio: 'pipe' })
        } catch {}
      }
    }

    return {
      purgedJobs,
      cleanedWorktrees,
    }
  }
}
