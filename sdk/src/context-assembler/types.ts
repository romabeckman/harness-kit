import type { Feature, Task } from '../file-state/types'
import type { ContextPayload } from '../agent-runner/types'

export interface BootstrapPayload extends ContextPayload {
  scope: string
  projectPaths: string[]
  backlogPath: string
}

export interface PhaseAPayload extends ContextPayload {
  scope: string
  domain: string
  featureTitle: string
  workingDir: string
  projectPaths: string[]
  steeringRules?: string[]
}

export interface PhaseBPayload extends ContextPayload {
  featureId: string
  featureTitle: string
  domain: string
  projectPaths: string[]
  tasks: Task[]
  isRetry: boolean
  reworks: number
  reworkLogPath?: string
  steeringRules?: string[]
}

export interface PhaseCPayload extends ContextPayload {
  featureId: string
  featureTitle: string
  domain: string
  projectPaths: string[]
  steeringRules?: string[]
  totalReworks: number
}

export interface PhaseEPayload extends ContextPayload {
  projectPaths: string[]
  workingDir: string
  steeringRules?: string[]
}

export interface PhaseAPayloadRequest {
  feature: Feature
  projectPaths: string[]
}

export interface PhaseBPayloadRequest {
  feature: Feature
  tasks: Task[]
  projectPaths: string[]
  isRetry: boolean
}

export interface PhaseCPayloadRequest {
  feature: Feature
  projectPaths: string[]
}

export interface PhaseEPayloadRequest {
  feature: Feature
  completedCycles: number
  decisions: string[]
}
