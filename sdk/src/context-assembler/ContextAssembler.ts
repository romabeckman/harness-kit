import { join } from 'path'
import type { Feature, Task, SteeringRulesConfig } from '../file-state/types'
import type { BootstrapPayload, PhaseAPayload, PhaseBPayload, PhaseCPayload, PhaseEPayload } from './types'
import { Phase } from '../orchestrator/types'


export class ContextAssembler {
  static buildBootstrapPayload(scope: string, projectPaths: string[], productDir: string): BootstrapPayload {
    return {
      scope,
      projectPaths,
      backlogPath: join(productDir, 'BACKLOG.md'),
    }
  }

  /**
   * Phase A: scope refinement — scope, domain, projectPaths, featureTitle
   */
  static buildPhaseAPayload(
    feature: Feature,
    projectPaths: string[],
    originalScope?: string,
    steeringRules?: SteeringRulesConfig
  ): PhaseAPayload {
    const payload: PhaseAPayload = {
      scope: originalScope || feature.title,
      domain: feature.domain,
      featureTitle: feature.title,
      projectPaths,
    }
    const flattened = this.flattenRules(Phase.PHASE_A, steeringRules)
    if (flattened) {
      payload.steeringRules = flattened
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
    steeringRules?: SteeringRulesConfig
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
    const flattened = this.flattenRules(Phase.PHASE_B, steeringRules)
    if (flattened) {
      payload.steeringRules = flattened
    }
    return payload
  }

  /**
   * Phase C: validation — featureId, domain, projectPaths only
   */
  static buildPhaseCPayload(feature: Feature, projectPaths: string[], steeringRules?: SteeringRulesConfig): PhaseCPayload {
    const payload: PhaseCPayload = {
      featureId: feature.id,
      featureTitle: feature.title,
      domain: feature.domain,
      projectPaths,
    }
    const flattened = this.flattenRules(Phase.PHASE_C, steeringRules)
    if (flattened) {
      payload.steeringRules = flattened
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
    steeringRules?: SteeringRulesConfig
  ): PhaseEPayload {
    const payload: PhaseEPayload = {
      domain: feature.domain,
      scopeDescription: feature.title,
      completedCycles,
      recentDecisions: decisions,
    }
    const flattened = this.flattenRules(Phase.PHASE_E, steeringRules)
    if (flattened) {
      payload.steeringRules = flattened
    }
    return payload
  }

  private static flattenRules(phase: Phase, configRules?: SteeringRulesConfig): string[] | undefined {
    if (!configRules) return undefined
    const rules: string[] = []

    let phaseRules: string[] | undefined

    if (phase === Phase.BOOTSTRAP) {
      phaseRules = configRules.bootstrap
    } else if (phase === Phase.PHASE_A) {
      phaseRules = configRules.phase_a
    } else if (phase === Phase.PHASE_B) {
      phaseRules = configRules.phase_b
    } else if (phase === Phase.PHASE_C) {
      phaseRules = configRules.phase_c
    } else if (phase === Phase.PHASE_E) {
      phaseRules = configRules.phase_e
    }

    if (phaseRules && phaseRules.length > 0) {
      rules.push(...phaseRules)
    }

    if (configRules.user && configRules.user.length > 0) {
      rules.push(...configRules.user)
    }

    return rules.length > 0 ? rules : undefined
  }
}
