export type FeatureStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED'

export type TaskStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED'

export type CurrentPhase = 'IMPLEMENTATION' | 'VALIDATION' | '-'

export interface Feature {
  id: string
  title: string
  domain: string
  priority: number
  dependencies: string[]
  reworks: number
  scoreTL: number | null
  scoreAdv: number | null
  status: FeatureStatus
}

export interface Task {
  featureId: string
  taskId: string
  project: string
  description: string
  domain: string
  currentPhase: CurrentPhase
  status: TaskStatus
}

export interface DecisionEntry {
  featureId: string | null
  decision: string
  scores?: { tl: number; adv: number }
  rationale?: string
}

export interface BootstrapConfig {
  scoreThresholds: {
    theGrumpyTechLead: { threshold: number }
    adversarialQA: { threshold: number }
  }
  completionCriteria: {
    maxReworks: number
  }
  cycleCounter: {
    completedCycles: number
  }
  currentPhase?: string
  steeringRules?: string[]
  originalScope?: string
}
