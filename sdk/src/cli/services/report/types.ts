import type { FeatureStatus, TaskStatus } from '../../../file-state/types'
import type { TokenReport } from '../../../telemetry/TokenLedger'

export interface BacklogSummary {
  total: number
  byStatus: Record<FeatureStatus, number>
  avgScoreTL: number | null
  avgScoreAdv: number | null
}

export interface FeatureProgress {
  featureId: string
  title: string
  status: FeatureStatus
  totalTasks: number
  completedTasks: number
  reworks: number
}

export interface TaskSummary {
  total: number
  byStatus: Record<TaskStatus, number>
  byFeature: Record<string, FeatureProgress>
}

export interface ConfigSnapshot {
  projectPaths: string[]
  currentPhase: string
  scoreThresholdTL: number
  scoreThresholdAdv: number
  maxReworks: number
  completedCycles: number
}

export interface DecisionSummary {
  totalDecisions: number
  recentDecisions: string[]
}

export interface ProductReport {
  backlogSummary: BacklogSummary
  taskSummary: TaskSummary
  configSnapshot: ConfigSnapshot
  decisionSummary: DecisionSummary
  tokenReport: TokenReport
}
