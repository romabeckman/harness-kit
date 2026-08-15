import { Phase } from '../types'
import type { OrchestratorConfig, OrchestratorState } from '../types'
import type { IFileStateManager } from '../../file-state/FileStateManager'
import type { Feature } from '../../file-state/types'
import type { AgentInvocation, AgentOutput, AgentSession } from '../../agent-runner/types'

export interface ExtractedTask {
  taskId: string
  description: string
  file: string
}

export interface DeveloperSessionState {
  readonly featureId: string
  readonly agent: string
  readonly session: AgentSession
  readonly phase: Phase
}

export interface Reviewontext {
  readonly config: OrchestratorConfig
  readonly workingDir: string
  readonly fsm: IFileStateManager
  developerSession?: DeveloperSessionState[] | DeveloperSessionState
  getDeveloperSession?(agent: string, featureId?: string, phase?: Phase): AgentSession | undefined
  setDeveloperSession?(sessionState: DeveloperSessionState): void
  invokeAgent(invocation: AgentInvocation): Promise<AgentOutput>
  getActiveFeature(features: Feature[]): Feature | null
  checkSpecFilesPresent(domain: string): boolean
  extractTasksFromTacticalDesign(domain: string): ExtractedTask[]
  onFeatureTransition?(completed: Feature, next: Feature | null, cycle: number): void
}

export interface IPhaseHandler {
  setNext(handler: IPhaseHandler): IPhaseHandler
  handle(phase: Phase, context: Reviewontext): Promise<Phase | null>
}

export abstract class AbstractPhaseHandler implements IPhaseHandler {
  private nextHandler?: IPhaseHandler

  setNext(handler: IPhaseHandler): IPhaseHandler {
    this.nextHandler = handler
    return handler
  }

  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (this.nextHandler) {
      return this.nextHandler.handle(phase, context)
    }
    return null
  }
}
