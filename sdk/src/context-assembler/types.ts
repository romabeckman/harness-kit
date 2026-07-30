import type { Feature, Task } from '../file-state/types'
import type { ContextPayload } from '../agent-runner/types'

export interface BootstrapPayload extends ContextPayload {
  scope: string
  projectPaths: string[]
  backlogPath: string
}

export interface DomainSpecs {
  problemSpace?: string;
  contextMap?: string;
  tacticalDesign?: string;
  testScenarios?: string;
}

export interface PlanningPayload extends ContextPayload {
  scope: string
  domain: string
  featureTitle: string
  workingDir: string
  projectPaths: string[]
  steeringRules?: string[]
}

export interface DevelopmenPayload extends ContextPayload {
  featureId: string
  featureTitle: string
  domain: string
  projectPaths: string[]
  tasks: Task[]
  isRetry: boolean
  reworks: number
  reworkLogPath?: string
  steeringRules?: string[]
  specsContent?: DomainSpecs
}

export interface ReviewPayload extends ContextPayload {
  featureId: string
  featureTitle: string
  domain: string
  projectPaths: string[]
  steeringRules?: string[]
  totalReworks: number
  specsContent?: DomainSpecs
}

export interface MemoryPayload extends ContextPayload {
  projectPaths: string[]
  workingDir: string
  steeringRules?: string[]
}

export interface PlanningPayloadRequest {
  feature: Feature
  projectPaths: string[]
}

export interface DevelopmenPayloadRequest {
  feature: Feature
  tasks: Task[]
  projectPaths: string[]
  isRetry: boolean
}

export interface ReviewPayloadRequest {
  feature: Feature
  projectPaths: string[]
}

export interface MemoryPayloadRequest {
  feature: Feature
  completedCycles: number
  decisions: string[]
}
