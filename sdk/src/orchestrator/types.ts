import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import type { Feature, Task, BootstrapConfig } from '../file-state/types'
import type { HarnessSettings } from '../settings/HarnessSettings'
import type { IPhaseHandler } from './phases/AbstractPhaseHandler'

export interface OrchestratorConfig {
  scope: string
  score: number
  reworks: number
  projectPaths: string[]
  agentRunner?: IAgentRunner  // defaults to ClaudeCLIRunner
  productDir?: string
  settings?: HarnessSettings
  timeoutMs?: number
  initialRules?: string
  complexity?: 'SIMPLE' | 'COMPLEX'
  chain?: IPhaseHandler
}

export enum Phase {
  BOOTSTRAP = 'BOOTSTRAP',
  PHASE_A = 'PLANNING',
  PHASE_B = 'IMPLEMENTATION',
  PHASE_C = 'VALIDATION',
  PHASE_D = 'STATE_CHECK',
  PHASE_E = 'STEERING',
  PHASE_F = 'DECISION',
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
