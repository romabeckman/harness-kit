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
}

export interface Reviewontext {
  readonly config: OrchestratorConfig
  readonly workingDir: string
  readonly fsm: IFileStateManager
  developerSession?: DeveloperSessionState[] | DeveloperSessionState
  getDeveloperSession?(agent: string, featureId?: string): AgentSession | undefined
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

  protected getDeveloperSession(context: Reviewontext, agent: string, featureId?: string): AgentSession | undefined {
    if (typeof context.getDeveloperSession === 'function') {
      return context.getDeveloperSession(agent, featureId)
    }
    if (Array.isArray(context.developerSession)) {
      return context.developerSession.find(
        s => s.agent === agent && (!featureId || s.featureId === featureId)
      )?.session
    }
    if (
      context.developerSession &&
      (context.developerSession as any).agent === agent &&
      (!featureId || (context.developerSession as any).featureId === featureId)
    ) {
      return (context.developerSession as any).session
    }
    return undefined
  }

  protected saveDeveloperSession(context: Reviewontext, sessionState: DeveloperSessionState): void {
    if (typeof context.setDeveloperSession === 'function') {
      context.setDeveloperSession(sessionState)
      return
    }
    if (!context.developerSession) {
      context.developerSession = [sessionState]
      return
    }
    if (Array.isArray(context.developerSession)) {
      const idx = context.developerSession.findIndex(
        s => s.agent === sessionState.agent && s.featureId === sessionState.featureId
      )
      if (idx >= 0) {
        context.developerSession[idx] = sessionState
      } else {
        context.developerSession.push(sessionState)
      }
    } else {
      const existing = context.developerSession as DeveloperSessionState
      if (existing.agent === sessionState.agent && existing.featureId === sessionState.featureId) {
        context.developerSession = [sessionState]
      } else {
        context.developerSession = [existing, sessionState]
      }
    }
  }
}
