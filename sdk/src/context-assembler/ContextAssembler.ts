import { join } from 'path'
import type { Feature, Task, SteeringRulesConfig } from '../file-state/types'
import type { BootstrapPayload, PlanningPayload, DevelopmenPayload, ReviewPayload, MemoryPayload } from './types'
import { Phase } from '../orchestrator/types'
import { loadDomainSpecsContent } from '../orchestrator/utils/PhaseFileUtils'


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
  static buildPlanningPayload(
    feature: Feature,
    workingDir: string,
    projectPaths: string[],
    scope?: string,
    steeringRules?: SteeringRulesConfig
  ): PlanningPayload {
    const payload: PlanningPayload = {
      scope: scope || feature.title,
      workingDir: workingDir,
      domain: feature.domain,
      featureTitle: feature.title,
      projectPaths,
    }
    const flattened = this.flattenRules(Phase.PLANNING, steeringRules)
    if (flattened) {
      payload.steeringRules = flattened
    }
    return payload
  }

  /**
   * Phase B: TDD orchestration — tasks, isRetry, optional reworkLogPath
   */
  static buildDevelopmenPayload(
    feature: Feature,
    workingDir: string,
    tasks: Task[],
    projectPaths: string[],
    isRetry: boolean,
    reworks?: number,
    steeringRules?: SteeringRulesConfig
  ): DevelopmenPayload {
    const payload: DevelopmenPayload = {
      featureId: feature.id,
      featureTitle: feature.title,
      domain: feature.domain,
      projectPaths,
      tasks: tasks,
      isRetry,
      reworks: reworks ? reworks : 0,
      specsContent: loadDomainSpecsContent(join(workingDir, 'docs', 'specs', feature.domain)),
    }
    if (isRetry) {
      payload.reworkLogPath = join('docs', 'specs', feature.domain, 'REWORK-LOG.md')
    }
    const flattened = this.flattenRules(Phase.DEVELOPMENT, steeringRules)
    if (flattened) {
      payload.steeringRules = flattened
    }
    return payload
  }

  /**
   * Phase C: validation — featureId, domain, projectPaths only
   */
  static buildReviewPayload(feature: Feature, workingDir: string, projectPaths: string[], steeringRules?: SteeringRulesConfig): ReviewPayload {
    const payload: ReviewPayload = {
      featureId: feature.id,
      featureTitle: feature.title,
      domain: feature.domain,
      projectPaths,
      totalReworks: feature.reworks || 0,
      specsContent: loadDomainSpecsContent(join(workingDir, 'docs', 'specs', feature.domain)),
    }
    const flattened = this.flattenRules(Phase.REVIEW, steeringRules)
    if (flattened) {
      payload.steeringRules = flattened
    }
    return payload
  }

  /**
   * Phase E: project memory — domain, scopeDescription, completedCycles, recentDecisions
   */
  static buildMemoryPayload(
    projectPaths: string[],
    workingDir: string,
    steeringRules?: SteeringRulesConfig,
  ): MemoryPayload {
    const payload: MemoryPayload = {
      projectPaths,
      workingDir,
    }
    const flattened = this.flattenRules(Phase.MEMORY, steeringRules)
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
    } else if (phase === Phase.PLANNING) {
      phaseRules = configRules.planning
    } else if (phase === Phase.DEVELOPMENT) {
      phaseRules = configRules.implementation
    } else if (phase === Phase.REVIEW) {
      phaseRules = configRules.review
    } else if (phase === Phase.MEMORY) {
      phaseRules = configRules.memory
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
