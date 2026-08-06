import type { JobStatusDto } from '../../../adapters/inbound/http/dto/JobStatusDto'

export interface IGetJobStatusUseCase {
  execute(jobId: string): Promise<JobStatusDto>
}
