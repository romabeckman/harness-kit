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
  activeFeatureId?: string | null
  pendingStatus?: FeatureStatus
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
    bootstrap: [
      "Minimal of 1 feature",
      "Plan each feature to have a maximum of 12 tasks"
    ],
    phase_a: ['Minimal of 1 and maximal of 12 tasks for each feature'],
    phase_b: [
      "If exist, read `docs/specs/${domain}/TL.json` and `docs/specs/${domain}/QA.json` for fixes details"
    ],
    phase_c: [
      "If you are running as `harness-code-reviewer` you MUST write (overwrite) your review json in a file `docs/specs/${domain}/TL.json`",
      "If you are running as `harness-qa` you MUST write (overwrite) your review json in a file `docs/specs/${domain}/QA.json`"
    ],
    phase_e: []
  }
}
