import { randomUUID } from 'node:crypto'
import { HttpServerError, OrchestrationJob } from '../types'
import type { JobStoreRepository } from '../repository/JobStoreRepository'
import type { JobQueue } from '../queue/JobQueue'
import type { RunResponseDto } from '../dto/RunResponseDto'
import type { RunRequestDtoExtended } from '../dto/RunRequestDto'

export class ResumeOrchestratorJobUseCase {
  constructor(
    private jobStore: JobStoreRepository,
    private jobQueue: JobQueue
  ) {}

  async execute(
    jobId: string,
    overrides?: Partial<RunRequestDtoExtended>
  ): Promise<RunResponseDto> {
    if (!jobId || jobId.trim() === '') {
      throw new HttpServerError(400, 'INVALID_JOB_ID', 'Job ID is required')
    }

    const previousJob = await this.jobStore.findById(jobId)
    if (!previousJob) {
      throw new HttpServerError(404, 'JOB_NOT_FOUND', `Job with ID '${jobId}' not found`)
    }

    if (previousJob.status === 'running') {
      throw new HttpServerError(
        400,
        'JOB_ALREADY_RUNNING',
        `Job '${jobId}' is currently running and cannot be resumed.`
      )
    }

    const newJobId = randomUUID()
    const createdAt = new Date().toISOString()

    const resumeRequest: RunRequestDtoExtended = {
      ...previousJob.request,
      ...overrides,
      action: 'resume',
    }

    const resumedJob: OrchestrationJob = {
      jobId: newJobId,
      status: 'queued',
      workspacePath: previousJob.workspacePath,
      request: resumeRequest,
      createdAt,
    }

    await this.jobStore.save(resumedJob)
    this.jobQueue.enqueue(resumedJob)

    return {
      jobId: newJobId,
      status: 'queued',
      workspacePath: previousJob.workspacePath,
      enqueuedAt: createdAt,
      statusUrl: `/orchestrator/status/${newJobId}`,
    }
  }
}
