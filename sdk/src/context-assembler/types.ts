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
  projectPaths: string[]
  steeringRules?: string[]
}

export interface PhaseBPayload extends ContextPayload {
  featureId: string
  featureTitle: string
  domain: string
  projectPaths: string[]
  tasks: Array<{ taskId: string; description: string }>
  isRetry: boolean
  reworkLogPath?: string
  steeringRules?: string[]
}

export interface PhaseCPayload extends ContextPayload {
  featureId: string
  domain: string
  projectPaths: string[]
  steeringRules?: string[]
}

export interface PhaseEPayload extends ContextPayload {
  domain: string
  scopeDescription: string
  completedCycles: number
  recentDecisions: string[]
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
