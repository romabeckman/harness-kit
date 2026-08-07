import path from 'node:path'
import type { LockRepository } from './LockRepository'

export class WorkspaceLockManager implements LockRepository {
  private locks = new Map<string, { jobId: string; acquiredAt: Date }>()

  private normalizePath(workspacePath: string): string {
    if (!workspacePath) return ''
    return path.resolve(workspacePath).replace(/\\/g, '/').replace(/\/+$/, '')
  }

  async acquireLock(workspacePath: string, jobId: string): Promise<boolean> {
    const key = this.normalizePath(workspacePath)
    const existing = this.locks.get(key)
    if (existing) {
      if (existing.jobId === jobId) {
        return true
      }
      return false
    }
    this.locks.set(key, { jobId, acquiredAt: new Date() })
    return true
  }

  async acquire(workspacePath: string, jobId: string): Promise<boolean> {
    return this.acquireLock(workspacePath, jobId)
  }

  async releaseLock(workspacePath: string, jobId: string): Promise<boolean> {
    const key = this.normalizePath(workspacePath)
    const existing = this.locks.get(key)
    if (!existing) {
      return false
    }
    if (existing.jobId !== jobId) {
      return false
    }
    this.locks.delete(key)
    return true
  }

  async release(workspacePath: string, jobId: string): Promise<boolean> {
    return this.releaseLock(workspacePath, jobId)
  }

  async isLocked(workspacePath: string): Promise<boolean> {
    const key = this.normalizePath(workspacePath)
    return this.locks.has(key)
  }

  async getLockOwner(workspacePath: string): Promise<string | null> {
    const key = this.normalizePath(workspacePath)
    const existing = this.locks.get(key)
    return existing ? existing.jobId : null
  }
}

export async function releaseWorkspaceLock(
  mgr: WorkspaceLockManager,
  workspacePath: string,
  jobId: string
): Promise<boolean> {
  return mgr.releaseLock(workspacePath, jobId)
}
