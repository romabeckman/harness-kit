import type { HealthStatusVo } from '../types'
import type { JobStoreRepository } from '../repository/JobStoreRepository'
import type { JobQueue } from '../queue/JobQueue'

export class GetHealthStatusUseCase {
  constructor(
    private jobStore: JobStoreRepository,
    private jobQueue: JobQueue
  ) {}

  async execute(): Promise<HealthStatusVo> {
    const activeJobs = await this.jobStore.listActive()
    const queuedJobs = this.jobQueue.size
    const mem = process.memoryUsage()

    return {
      status: 'healthy',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      activeJobs: activeJobs.length,
      queuedJobs,
      memoryUsage: {
        rssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
        heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
      },
    }
  }
}
