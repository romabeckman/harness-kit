import type { JobStatus } from '../../../../domain/types'

export interface RunResponseDto {
  jobId: string
  status: JobStatus
  workspacePath: string
  enqueuedAt: string
  statusUrl: string
}
