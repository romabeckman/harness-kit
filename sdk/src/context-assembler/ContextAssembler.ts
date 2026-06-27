import { join } from 'path'
import type { Feature, Task } from '../file-state/types'
import type { PhaseAPayload, PhaseBPayload, PhaseCPayload, PhaseEPayload } from './types'

export class ContextAssembler {
  /**
   * Phase A: scope refinement — only scope, domain, projectPaths
   */
  static buildPhaseAPayload(feature: Feature, projectPaths: string[]): PhaseAPayload {
    return {
      scope: feature.id,
      domain: feature.domain,
      projectPaths,
    }
  }

  /**
   * Phase B: TDD orchestration — tasks, isRetry, optional reworkLogPath
   */
  static buildPhaseBPayload(
    feature: Feature,
    tasks: Task[],
    projectPaths: string[],
    isRetry: boolean
  ): PhaseBPayload {
    const payload: PhaseBPayload = {
      featureId: feature.id,
      domain: feature.domain,
      projectPaths,
      tasks: tasks.map(t => ({ taskId: t.taskId, description: t.description })),
      isRetry,
    }
    if (isRetry) {
      payload.reworkLogPath = join('docs', 'specs', feature.domain, 'REWORK-LOG.md')
    }
    return payload
  }

  /**
   * Phase C: validation — featureId, domain, projectPaths only
   */
  static buildPhaseCPayload(feature: Feature, projectPaths: string[]): PhaseCPayload {
    return {
      featureId: feature.id,
      domain: feature.domain,
      projectPaths,
    }
  }

  /**
   * Phase E: project memory — domain, scopeDescription, completedCycles, recentDecisions
   */
  static buildPhaseEPayload(
    feature: Feature,
    completedCycles: number,
    decisions: string[]
  ): PhaseEPayload {
    return {
      domain: feature.domain,
      scopeDescription: feature.title,
      completedCycles,
      recentDecisions: decisions,
    }
  }
}
