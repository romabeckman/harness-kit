import type { TokensTelemetryDto, TokensTelemetryQueryOptions } from '../../../adapters/inbound/http/dto/TokensTelemetryDto'

export interface IGetTokensTelemetryUseCase {
  execute(
    projectIdentifier?: string,
    jobId?: string,
    options?: TokensTelemetryQueryOptions
  ): Promise<TokensTelemetryDto>
}
