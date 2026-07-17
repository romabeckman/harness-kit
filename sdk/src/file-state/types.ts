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

export type FeatureLayer = 'backend' | 'frontend' | 'qa' | 'devops'

export interface Feature {
  id: string
  title: string
  domain: string
  layer?: FeatureLayer | null
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
  originalScope?: string
  projectPaths?: string[]
  scoreThresholdTL: number
  scoreThresholdAdv: number
  completionCriteria: {
    maxReworks: number
  }
  cycleCounter: {
    completedCycles: number
  }
  currentPhase?: string
  activeFeatureId?: string | null
  steeringRules?: SteeringRulesConfig
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
    bootstrap: [
      "Granularity rule: each feature is one deliverable chunk — one project per feature, or one flow including combined projects (frontend and backend for example), or one meaningful part of a large project if splitting is necessary. Never mix multiple unrelated projects in a single feature."
    ],
    phase_a: [
      'Create a minimum of 1 and a maximum of 5 tasks for each `003-\${PROJECT_NAME}-tactical-design.md` (maximum of 10 tasks total)'
    ],
    phase_b: [],
    phase_c: [],
    phase_e: []
  }
}
