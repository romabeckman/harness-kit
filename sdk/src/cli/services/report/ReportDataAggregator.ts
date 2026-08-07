import type { Feature, Task, BootstrapConfig, FeatureStatus, TaskStatus } from '../../../file-state/types'
import type { IFileStateManager } from '../../../file-state/FileStateManager'
import type { TokenLedger, TokenReport } from '../../../telemetry/TokenLedger'
import type {
  ProductReport,
  BacklogSummary,
  TaskSummary,
  ConfigSnapshot,
  DecisionSummary,
  FeatureProgress
} from './types'

export class ReportDataAggregator {
  constructor(
    private readonly fsm: IFileStateManager,
    private readonly ledger: TokenLedger
  ) {}

  aggregate(): ProductReport {
    let features: Feature[] = []
    let tasks: Task[] = []
    let config: BootstrapConfig | null = null
    let decisions: string[] = []
    let tokenReport: TokenReport = {
      entries: [],
      events: [],
      totals: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0 },
      bySkill: {}
    }

    try {
      features = this.fsm.loadBacklog()
    } catch {}

    try {
      tasks = this.fsm.loadDevelopmentState()
    } catch {}

    try {
      config = this.fsm.loadBootstrapConfig()
    } catch {}

    try {
      decisions = this.fsm.loadRecentDecisions(1000000) // load all to count, but we might want just count if there's a better way
    } catch {}

    try {
      tokenReport = this.ledger.report()
    } catch {}

    return {
      backlogSummary: this.aggregateBacklogSummary(features),
      taskSummary: this.aggregateTaskSummary(tasks, features),
      configSnapshot: this.aggregateConfigSnapshot(config),
      decisionSummary: this.aggregateDecisionSummary(decisions),
      tokenReport
    }
  }

  private aggregateBacklogSummary(features: Feature[]): BacklogSummary {
    const byStatus: Record<FeatureStatus, number> = {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      BLOCKED: 0,
      FAILED: 0
    }

    let sumTL = 0
    let countTL = 0
    let sumAdv = 0
    let countAdv = 0

    for (const f of features) {
      if (byStatus[f.status] !== undefined) {
        byStatus[f.status]++
      }
      
      if (f.scoreTL !== null) {
        sumTL += f.scoreTL
        countTL++
      }
      
      if (f.scoreAdv !== null) {
        sumAdv += f.scoreAdv
        countAdv++
      }
    }

    return {
      total: features.length,
      byStatus,
      avgScoreTL: countTL > 0 ? sumTL / countTL : null,
      avgScoreAdv: countAdv > 0 ? sumAdv / countAdv : null
    }
  }

  private aggregateTaskSummary(tasks: Task[], features: Feature[]): TaskSummary {
    const byStatus: Record<TaskStatus, number> = {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      BLOCKED: 0,
      FAILED: 0
    }

    const byFeature: Record<string, FeatureProgress> = {}

    const featureMap = new Map<string, Feature>()
    for (const f of features) {
      featureMap.set(f.id, f)
    }

    for (const t of tasks) {
      if (byStatus[t.status] !== undefined) {
        byStatus[t.status]++
      }

      if (!byFeature[t.featureId]) {
        const feature = featureMap.get(t.featureId)
        byFeature[t.featureId] = {
          featureId: t.featureId,
          title: feature?.title ?? '',
          status: feature?.status ?? 'NOT_STARTED',
          totalTasks: 0,
          completedTasks: 0,
          reworks: feature?.reworks ?? 0
        }
      }

      byFeature[t.featureId].totalTasks++
      if (t.status === 'COMPLETED') {
        byFeature[t.featureId].completedTasks++
      }
    }

    return {
      total: tasks.length,
      byStatus,
      byFeature
    }
  }

  private aggregateConfigSnapshot(config: BootstrapConfig | null): ConfigSnapshot {
    if (!config) {
      return {
        projectPaths: [],
        currentPhase: 'BOOTSTRAP',
        scoreThresholdTL: 0,
        scoreThresholdAdv: 0,
        maxReworks: 0,
        completedCycles: 0
      }
    }
    return {
      projectPaths: config.projectPaths ?? [],
      currentPhase: config.currentPhase ?? 'BOOTSTRAP',
      scoreThresholdTL: config.scoreThresholdTL ?? 0,
      scoreThresholdAdv: config.scoreThresholdAdv ?? 0,
      maxReworks: config.completionCriteria?.maxReworks ?? 0,
      completedCycles: config.cycleCounter?.completedCycles ?? 0
    }
  }

  private aggregateDecisionSummary(decisions: string[]): DecisionSummary {
    return {
      totalDecisions: decisions.length,
      recentDecisions: decisions.slice(-5)
    }
  }
}
