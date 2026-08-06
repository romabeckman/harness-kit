import type { JobStoreRepository } from './JobStoreRepository'
import type { OrchestrationJob, JobStatus } from '../types'

export class InMemoryJobStore implements JobStoreRepository {
  private jobs = new Map<string, OrchestrationJob>()

  async save(job: OrchestrationJob): Promise<void> {
    this.jobs.set(job.jobId, JSON.parse(JSON.stringify(job)))
  }

  async findById(jobId: string): Promise<OrchestrationJob | null> {
    const job = this.jobs.get(jobId)
    if (!job) {
      return null
    }
    return JSON.parse(JSON.stringify(job))
  }

  async updateStatus(
    jobId: string,
    status: JobStatus,
    error?: { code: string; message: string }
  ): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new Error(`Job not found: ${jobId}`)
    }

    job.status = status
    const now = new Date().toISOString()

    if (status === 'running' && !job.startedAt) {
      job.startedAt = now
    }

    if (
      (status === 'completed' || status === 'failed' || status === 'aborted') &&
      !job.completedAt
    ) {
      job.completedAt = now
    }

    if (error) {
      job.error = error
    }

    this.jobs.set(jobId, job)
  }

  async listActive(): Promise<OrchestrationJob[]> {
    const activeJobs: OrchestrationJob[] = []
    for (const job of this.jobs.values()) {
      if (job.status === 'queued' || job.status === 'running') {
        activeJobs.push(JSON.parse(JSON.stringify(job)))
      }
    }
    return activeJobs
  }
}
