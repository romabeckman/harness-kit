import type { CleanResultVo } from '../../use-cases/CleanJobsAndWorktreesUseCase'

export interface ICleanJobsAndWorktreesUseCase {
  execute(maxAgeMs?: number): Promise<CleanResultVo>
}
