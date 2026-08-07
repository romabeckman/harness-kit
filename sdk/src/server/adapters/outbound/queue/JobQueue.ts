import { EventEmitter } from 'node:events'
import type { OrchestrationJob } from '../../../domain/types'
import type { WorkspaceLockManager } from '../mutex/WorkspaceLockManager'

export class JobQueue extends EventEmitter {
  private queue: OrchestrationJob[] = []

  enqueue(job: OrchestrationJob): void {
    this.queue.push(JSON.parse(JSON.stringify(job)))
    this.emit('workerNotify')
  }

  dequeue(): OrchestrationJob | undefined {
    return this.queue.shift()
  }

  async dequeueNextAvailable(lockManager: WorkspaceLockManager): Promise<OrchestrationJob | undefined> {
    for (let i = 0; i < this.queue.length; i++) {
      const candidate = this.queue[i]
      const acquired = await lockManager.acquireLock(candidate.workspacePath, candidate.jobId)
      if (acquired) {
        this.queue.splice(i, 1)
        return candidate
      }
    }
    return undefined
  }

  notifyLockReleased(_workspacePath: string): void {
    this.emit('workerNotify')
  }

  getQueuePosition(jobId: string): number {
    const idx = this.queue.findIndex((job) => job.jobId === jobId)
    return idx === -1 ? -1 : idx + 1
  }

  getPendingJobs(): OrchestrationJob[] {
    return JSON.parse(JSON.stringify(this.queue))
  }

  get size(): number {
    return this.queue.length
  }

  clear(): void {
    this.queue = []
  }
}
