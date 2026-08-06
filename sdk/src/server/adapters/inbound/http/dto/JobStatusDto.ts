import type { JobStatus } from '../../../../domain/types'

export interface JobStatusDto {
  jobId: string
  status: JobStatus
  createdAt: string
  startedAt?: string
  completedAt?: string
  progress?: {
    phase?: string
    step?: number
  }
  error?: {
    code: string
    message: string
  }
}
