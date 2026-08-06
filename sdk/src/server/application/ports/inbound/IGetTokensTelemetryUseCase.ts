import type { TokensTelemetryDto } from '../../../adapters/inbound/http/dto/TokensTelemetryDto'

export interface IGetTokensTelemetryUseCase {
  execute(projectIdentifier?: string, jobId?: string): Promise<TokensTelemetryDto>
}
