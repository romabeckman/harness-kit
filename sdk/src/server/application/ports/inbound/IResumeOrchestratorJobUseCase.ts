import type { RunRequestDtoExtended } from '../../../adapters/inbound/http/dto/RunRequestDto'
import type { RunResponseDto } from '../../../adapters/inbound/http/dto/RunResponseDto'

export interface IResumeOrchestratorJobUseCase {
  execute(jobId: string, overrides?: Partial<RunRequestDtoExtended>): Promise<RunResponseDto>
}
