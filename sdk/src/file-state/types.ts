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
  layer: FeatureLayer | null
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
  originalScope: string
  projectPaths: string[]
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
    phase_a: [
      'Create a minimum of 1 and a maximum of 12 tasks',
      "Evaluate scope complexity: Classify as 'SIMPLE' if changes are isolated (e.g., basic CRUD, minor UI/API enhancements, or bug fixes with no architectural impact). IF 'SIMPLE', generate ONLY '003-${PROJECT_NAME}-tactical-design.md' and '004-${PROJECT_NAME}-test-scenarios.md'.",
      "Evaluate scope complexity: Classify as 'COMPLEX' if the scope introduces new core features, cross-domain interactions, external integrations, or intricate business logic. IF 'COMPLEX', generate ALL specified documents (001, 002, 003, and 004)."
    ],
    phase_b: [
      "If exist, read `docs/specs/${domain}/TL.json` and `docs/specs/${domain}/QA.json` for fixes details"
    ],
    phase_c: [
      "If you are running as `harness-tech-lead` you MUST write (overwrite) your review json in a file `docs/specs/${domain}/TL.json`",
      "If you are running as `harness-qa` you MUST write (overwrite) your review json in a file `docs/specs/${domain}/QA.json`"
    ],
    phase_e: []
  }
}
