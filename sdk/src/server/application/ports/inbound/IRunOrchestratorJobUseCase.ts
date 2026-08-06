import type { RunRequestDtoExtended } from '../../../adapters/inbound/http/dto/RunRequestDto'
import type { RunResponseDto } from '../../../adapters/inbound/http/dto/RunResponseDto'

export interface IRunOrchestratorJobUseCase {
  execute(body: RunRequestDtoExtended): Promise<RunResponseDto>
}
