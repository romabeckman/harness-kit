import { HttpServerError } from '../../domain/types'
import type { JobStoreRepository } from '../../adapters/outbound/repository/JobStoreRepository'
import type { JobStatusDto } from '../../adapters/inbound/http/dto/JobStatusDto'

export class GetJobStatusUseCase {
  constructor(private jobStore: JobStoreRepository) {}

  async execute(jobId: string): Promise<JobStatusDto> {
    if (!jobId || jobId.trim() === '') {
      throw new HttpServerError(400, 'INVALID_JOB_ID', 'Job ID is required')
    }

    const job = await this.jobStore.findById(jobId)
    if (!job) {
      throw new HttpServerError(404, 'JOB_NOT_FOUND', `Job with ID '${jobId}' not found`)
    }

    return {
      jobId: job.jobId,
      status: job.status,
      workspacePath: job.workspacePath,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      progress: job.progress,
      error: job.error,
    }
  }
}
