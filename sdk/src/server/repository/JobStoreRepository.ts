import type { OrchestrationJob, JobStatus } from '../types'

export interface JobStoreRepository {
  save(job: OrchestrationJob): Promise<void>
  findById(jobId: string): Promise<OrchestrationJob | null>
  updateStatus(
    jobId: string,
    status: JobStatus,
    error?: { code: string; message: string }
  ): Promise<void>
  listActive(): Promise<OrchestrationJob[]>
}
