import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import type { Feature, Task, BootstrapConfig } from '../file-state/types'
import type { HarnessSettings } from '../settings/HarnessSettings'

export interface OrchestratorConfig {
  scope: string
  projectPaths: string[]
  score: number
  reworks: number
  agentRunner?: IAgentRunner  // defaults to ClaudeCodeRunner
  productDir?: string
  settings?: HarnessSettings
  timeoutMs?: number
  initialRules?: string
}

export enum Phase {
  BOOTSTRAP = 'BOOTSTRAP',
  PHASE_A = 'PHASE_A',
  PHASE_B = 'PHASE_B',
  PHASE_C = 'PHASE_C',
  PHASE_D = 'PHASE_D',
  PHASE_E = 'PHASE_E',
  PHASE_F = 'PHASE_F',
  CASCADE_BLOCKED = 'CASCADE_BLOCKED',
  HALTED = 'HALTED',
}

export interface OrchestratorState {
  currentPhase: Phase
  activeFeatureId: string | null
  completedCycles: number
}

export type PhaseTransition = {
  from: Phase
  condition: string
  to: Phase
}

export interface OnDiskState {
  productFilesExist: boolean
  features: Feature[]
  tasks: Task[]
  config: BootstrapConfig | null
  activeFeature: Feature | null
  specFilesPresent: boolean
  tddOutputPresent: boolean
  allTasksCompleted: boolean
}
