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
  steeringRules?: SteeringRulesConfig
  originalScope?: string
}

export interface SteeringRulesConfig {
  user?: string[]
  bootstrap?: string[]
  phase_a?: string[]
  phase_b?: string[]
  phase_c?: string[]
  phase_e?: string[]
}

export function createDefaultSteeringRules(initialRules?: string): SteeringRulesConfig {
  return {
    user: initialRules ? [initialRules] : [],
    bootstrap: [],
    phase_a: ['Limit of 5 tasks for feature'],
    phase_b: [],
    phase_c: [],
    phase_e: []
  }
}
