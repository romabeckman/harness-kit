import type { JobStatus } from '../types'

export interface RunResponseDto {
  jobId: string
  status: Extract<JobStatus, 'queued' | 'running'>
  workspacePath: string
  enqueuedAt: string
  statusUrl: string
}
