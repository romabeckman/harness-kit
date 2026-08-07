import type { JobStatus } from '../../../../domain/types'

export interface RunResponseDto {
  jobId: string
  status: JobStatus
  enqueuedAt: string
  statusUrl: string
}
