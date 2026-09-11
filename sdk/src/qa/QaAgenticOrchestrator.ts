import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import { QaService } from './QaService'
import { QaRunStore } from './QaRunStore'
import { QaExecutionPhase, QaPhase, QaPlanningPhase, QaReportingPhase, type QaPhaseContext, type QaPhaseHandler } from './phases'
import type { QaAgenticRequest, QaDriver, QaFinalReport } from './types'
import type { HarnessSettings } from '../settings/HarnessSettings'
import type { QaProgressEvent, QaProgressListener } from './progress'

export interface QaAgenticOrchestratorOptions {
  workspace: string
  runner: IAgentRunner
  store?: QaRunStore
  drivers?: QaDriver[]
  phases?: QaPhaseHandler[]
  settings?: HarnessSettings
  model?: string
  effort?: string
  onProgress?: QaProgressListener
}

export class QaAgenticOrchestrator {
  readonly #context: Omit<QaPhaseContext, 'request'>
  readonly #phases: Map<QaPhase, QaPhaseHandler>

  constructor(options: QaAgenticOrchestratorOptions) {
    const store = options.store ?? new QaRunStore(options.workspace)
    this.#context = {
      workspace: options.workspace,
      runner: options.runner,
      store,
      service: new QaService(store, options.drivers),
      settings: options.settings,
      model: options.model,
      effort: options.effort,
      onProgress: options.onProgress,
    }
    const phases = options.phases ?? [new QaPlanningPhase(), new QaExecutionPhase(), new QaReportingPhase()]
    this.#phases = new Map(phases.map((phase) => [phase.phase, phase]))
  }

  async run(request: QaAgenticRequest = {}, signal?: AbortSignal): Promise<QaFinalReport> {
    const context: QaPhaseContext = { ...this.#context, request }
    let current = QaPhase.PLANNING
    while (current !== QaPhase.COMPLETED) {
      const handler = this.#phases.get(current)
      if (!handler) throw new Error(`No agentic QA handler for phase ${current}`)
      context.onProgress?.({ type: 'phase_started', phase: current })
      const completed = current
      current = await handler.execute(context, signal)
      context.onProgress?.(this.phaseCompleted(completed, context))
    }
    if (!context.report) throw new Error('Agentic QA completed without a final report')
    return context.report
  }

  private phaseCompleted(phase: Exclude<QaPhase, QaPhase.COMPLETED>, context: QaPhaseContext): QaProgressEvent {
    if (phase === QaPhase.PLANNING) return { type: 'phase_completed', phase, totalScenarios: context.plan?.scenarios.length }
    if (phase === QaPhase.EXECUTION) return { type: 'phase_completed', phase, verdict: context.run?.verdict }
    return { type: 'phase_completed', phase }
  }
}
