export interface LockRepository {
  acquireLock(workspacePath: string, jobId: string): Promise<boolean>
  releaseLock(workspacePath: string, jobId: string): Promise<boolean>
  isLocked(workspacePath: string): Promise<boolean>
  getLockOwner(workspacePath: string): Promise<string | null>
}
