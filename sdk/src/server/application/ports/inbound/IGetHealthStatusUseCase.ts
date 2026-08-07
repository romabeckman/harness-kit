import type { HealthStatusVo } from '../../../domain/types'

export interface IGetHealthStatusUseCase {
  execute(): Promise<HealthStatusVo>
}
