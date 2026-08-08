import type { JobQueue } from '../queue/JobQueue'
import type { WorkspaceLockManager } from '../mutex/WorkspaceLockManager'
import type { JobStoreRepository } from '../repository/JobStoreRepository'
import type { OrchestrationJob } from '../../../domain/types'
import { WorkerPoolConfig } from '../../../domain/types'

export type JobProcessorFn = (job: OrchestrationJob) => Promise<void>

export interface AsyncWorkerPoolOptions {
  maxConcurrency?: number
  config?: WorkerPoolConfig
  queue: JobQueue
  lockManager: WorkspaceLockManager
  jobStore: JobStoreRepository
  processor?: JobProcessorFn
}

export class AsyncWorkerPool {
  readonly maxConcurrency: number
  private queue: JobQueue
  private lockManager: WorkspaceLockManager
  private jobStore: JobStoreRepository
  private processor?: JobProcessorFn
  private activeWorkers = 0
  private isRunning = false
  private listener?: () => void
  private activeTasks = new Set<Promise<void>>()

  constructor(options: AsyncWorkerPoolOptions) {
    this.maxConcurrency = options.config?.maxConcurrency ?? options.maxConcurrency ?? 4
    this.queue = options.queue
    this.lockManager = options.lockManager
    this.jobStore = options.jobStore
    this.processor = options.processor
  }

  get activeCount(): number {
    return this.activeWorkers
  }

  setJobProcessor(processor: JobProcessorFn): void {
    this.processor = processor
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.listener = () => {
      void this.processPending()
    }
    this.queue.on('workerNotify', this.listener)
    void this.processPending()
  }

  stop(): void {
    this.isRunning = false
    if (this.listener) {
      this.queue.off('workerNotify', this.listener)
      this.listener = undefined
    }
  }

  async drain(): Promise<void> {
    await Promise.all(Array.from(this.activeTasks))
  }

  async processPending(): Promise<number> {
    let dispatched = 0

    while (this.activeWorkers < this.maxConcurrency) {
      const nextJob = await this.queue.dequeueNextAvailable(this.lockManager)
      if (!nextJob) break

      dispatched++
      this.activeWorkers++

      const taskPromise = (async () => {
        try {
          if (this.processor) {
            await this.processor(nextJob)
          }
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err)
          await this.jobStore.updateStatus(nextJob.jobId, 'failed', {
            code: 'WORKER_JOB_FAILED',
            message,
          })
        } finally {
          this.activeWorkers--
          await this.lockManager.releaseLock(nextJob.workspacePath, nextJob.jobId)
          this.queue.notifyLockReleased(nextJob.workspacePath)
          if (this.isRunning || this.queue.size > 0) {
            void this.processPending()
          }
        }
      })()

      this.activeTasks.add(taskPromise)
      taskPromise.finally(() => this.activeTasks.delete(taskPromise))
    }

    return dispatched
  }
}
