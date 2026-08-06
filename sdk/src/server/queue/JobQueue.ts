import { EventEmitter } from 'node:events'
import type { OrchestrationJob } from '../types'
import type { WorkspaceLockManager } from '../mutex/WorkspaceLockManager'

export class JobQueue extends EventEmitter {
  private queue: OrchestrationJob[] = []

  enqueue(job: OrchestrationJob): void {
    this.queue.push(job)
    this.emit('jobEnqueued', job)
    this.emit('workerNotify')
  }

  enqueueJob(job: OrchestrationJob): void {
    this.enqueue(job)
  }

  dequeue(): OrchestrationJob | undefined {
    return this.queue.shift()
  }

  getQueuePosition(jobId: string): number {
    const index = this.queue.findIndex((j) => j.jobId === jobId)
    return index === -1 ? -1 : index + 1
  }

  getPendingJobs(): OrchestrationJob[] {
    return [...this.queue]
  }

  clear(): void {
    this.queue = []
  }

  get size(): number {
    return this.queue.length
  }

  async dequeueNextAvailable(lockManager?: WorkspaceLockManager): Promise<OrchestrationJob | null> {
    if (this.queue.length === 0) {
      return null
    }

    if (!lockManager) {
      const job = this.dequeue()
      return job ?? null
    }

    for (let i = 0; i < this.queue.length; i++) {
      const job = this.queue[i]
      const locked = await lockManager.isLocked(job.workspacePath)
      if (!locked) {
        this.queue.splice(i, 1)
        return job
      }
    }

    return null
  }

  notifyLockReleased(workspacePath?: string): void {
    this.emit('lockReleased', workspacePath)
    this.emit('workerNotify')
  }
}
