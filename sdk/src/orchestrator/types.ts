import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import type { Feature, Task, BootstrapConfig } from '../file-state/types'
import type { HarnessSettings } from '../settings/HarnessSettings'
import type { IPhaseHandler } from './phases/AbstractPhaseHandler'

export interface OrchestratorConfig {
  scope: string
  score?: number
  reworks?: number
  projectPaths: string[]
  agentRunner?: IAgentRunner  // defaults to ClaudeCLIRunner
  productDir?: string
  settings?: HarnessSettings
  timeoutMs?: number
  initialRules?: string
  complexity: Complexity
  chain?: IPhaseHandler
  cliCommand?: CliCommand
  /** When true, Phase C (review) is skipped entirely and execution jumps to Phase D. */
  skipValidation?: boolean
  /** When true, Phase E (memory) is skipped entirely and execution jumps to Phase F. */
  skipSteering?: boolean
  /** When true, Phase DEPLOY (git stage/commit/push) is skipped and pipeline halts after Phase F. */
  skipDeploy?: boolean
}

export enum Complexity {
  AUTO = 'AUTO',
  SIMPLE = 'SIMPLE',
  COMPLEX = 'COMPLEX'
}

export enum CliCommand {
  INIT = 'init',
  RUN = 'run',
}

export enum Phase {
  BOOTSTRAP = 'BOOTSTRAP',
  PHASE_A = 'PLANNING',
  PHASE_B = 'DEVELOPMENT',
  PHASE_C = 'REVIEW',
  PHASE_D = 'STATE_CHECK',
  PHASE_E = 'MEMORY',
  PHASE_F = 'TRANSITION',
  PHASE_G = 'DEPLOY',
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
