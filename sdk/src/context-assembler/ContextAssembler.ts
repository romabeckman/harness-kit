import { join } from 'path'
import type { Feature, Task } from '../file-state/types'
import type { BootstrapPayload, PhaseAPayload, PhaseBPayload, PhaseCPayload, PhaseEPayload } from './types'

export class ContextAssembler {
  static buildBootstrapPayload(scope: string, projectPaths: string[], productDir: string): BootstrapPayload {
    return {
      scope,
      projectPaths,
      backlogPath: join(productDir, 'BACKLOG.md'),
    }
  }

  /**
   * Phase A: scope refinement — only scope, domain, projectPaths
   */
  static buildPhaseAPayload(feature: Feature, projectPaths: string[], steeringRules?: string[]): PhaseAPayload {
    const payload: PhaseAPayload = {
      scope: feature.title,
      domain: feature.domain,
      projectPaths,
    }
    if (steeringRules && steeringRules.length > 0) {
      payload.steeringRules = steeringRules
    }
    return payload
  }

  /**
   * Phase B: TDD orchestration — tasks, isRetry, optional reworkLogPath
   */
  static buildPhaseBPayload(
    feature: Feature,
    tasks: Task[],
    projectPaths: string[],
    isRetry: boolean,
    steeringRules?: string[]
  ): PhaseBPayload {
    const payload: PhaseBPayload = {
      featureId: feature.id,
      featureTitle: feature.title,
      domain: feature.domain,
      projectPaths,
      tasks: tasks.map(t => ({ taskId: t.taskId, description: t.description })),
      isRetry,
    }
    if (isRetry) {
      payload.reworkLogPath = join('docs', 'specs', feature.domain, 'REWORK-LOG.md')
    }
    if (steeringRules && steeringRules.length > 0) {
      payload.steeringRules = steeringRules
    }
    return payload
  }

  /**
   * Phase C: validation — featureId, domain, projectPaths only
   */
  static buildPhaseCPayload(feature: Feature, projectPaths: string[], steeringRules?: string[]): PhaseCPayload {
    const payload: PhaseCPayload = {
      featureId: feature.id,
      domain: feature.domain,
      projectPaths,
    }
    if (steeringRules && steeringRules.length > 0) {
      payload.steeringRules = steeringRules
    }
    return payload
  }

  /**
   * Phase E: project memory — domain, scopeDescription, completedCycles, recentDecisions
   */
  static buildPhaseEPayload(
    feature: Feature,
    completedCycles: number,
    decisions: string[],
    steeringRules?: string[]
  ): PhaseEPayload {
    const payload: PhaseEPayload = {
      domain: feature.domain,
      scopeDescription: feature.title,
      completedCycles,
      recentDecisions: decisions,
    }
    if (steeringRules && steeringRules.length > 0) {
      payload.steeringRules = steeringRules
    }
    return payload
  }
}
