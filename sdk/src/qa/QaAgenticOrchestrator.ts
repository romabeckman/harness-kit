import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import { QaService } from './services/QaService'
import { QaRunStore } from './services/QaRunStore'
import { QaAnalysisPhase, QaExecutionPhase, QaPhase, QaPlanningPhase, QaReportingPhase, QaValidationPhase, type QaPhaseContext, type QaPhaseHandler } from './phases'
import type { QaAgenticRequest, QaDriver, QaFinalReport, QaPlan } from './types'
import type { HarnessSettings } from '../settings/HarnessSettings'
import type { QaProgressEvent, QaProgressListener } from './progress'
import { QaRuntimeManager, type QaRuntimePreparer } from './services/QaRuntimeManager'
import type { QaTargetProbe } from './services/QaTargetProbe'

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
  runtime?: QaRuntimePreparer
  targetProbe?: QaTargetProbe
}

export class QaAgenticOrchestrator {
  readonly #context: Omit<QaPhaseContext, 'request'>
  readonly #phases: Map<QaPhase, QaPhaseHandler>
  readonly #runtime: QaRuntimePreparer

  constructor(options: QaAgenticOrchestratorOptions) {
    const store = options.store ?? new QaRunStore(options.workspace)
    this.#context = {
      workspace: options.workspace,
      runner: options.runner,
      store,
      service: new QaService(store, options.drivers, options.targetProbe),
      settings: options.settings,
      model: options.model,
      effort: options.effort,
      onProgress: options.onProgress,
    }
    const phases = options.phases ?? [new QaPlanningPhase(), new QaValidationPhase(), new QaExecutionPhase(), new QaAnalysisPhase(), new QaReportingPhase()]
    this.#phases = new Map(phases.map((phase) => [phase.phase, phase]))
    this.#runtime = options.runtime ?? new QaRuntimeManager(options.workspace)
  }

  async run(request: QaAgenticRequest = {}, signal?: AbortSignal): Promise<QaFinalReport> {
    return this.runFrom(QaPhase.PLANNING, request, undefined, signal)
  }

  async resume(plan: QaPlan, signal?: AbortSignal): Promise<QaFinalReport> {
    return this.runFrom(QaPhase.VALIDATION, {
      scope: `Resume stored QA plan ${plan.id}@${plan.version}`,
      scenarios: plan.scenarios.flatMap((scenario) => scenario.description ? [scenario.description] : []),
      target: plan.target,
      profile: plan.profile,
    }, plan, signal)
  }

  private async runFrom(start: QaPhase, request: QaAgenticRequest, plan?: QaPlan, signal?: AbortSignal): Promise<QaFinalReport> {
    const runtime = await this.#runtime.prepare(request, signal)
    const resolvedRequest = runtime ? { ...request, target: runtime.target } : request
    if (runtime) this.#context.onProgress?.({ type: 'runtime_ready', target: runtime.target, managed: runtime.managed })
    try {
      const context: QaPhaseContext = { ...this.#context, request: resolvedRequest, plan, persistPlan: start === QaPhase.PLANNING }
      let current = start
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
    } finally {
      await runtime?.stop()
    }
  }

  private phaseCompleted(phase: Exclude<QaPhase, QaPhase.COMPLETED>, context: QaPhaseContext): QaProgressEvent {
    if (phase === QaPhase.PLANNING) return { type: 'phase_completed', phase, totalScenarios: context.plan?.scenarios.length }
    if (phase === QaPhase.VALIDATION) return { type: 'phase_completed', phase }
    if (phase === QaPhase.EXECUTION) return { type: 'phase_completed', phase, verdict: context.run?.verdict }
    if (phase === QaPhase.ANALYSIS) return { type: 'phase_completed', phase, totalScenarios: context.plan?.scenarios.length, verdict: context.run?.verdict }
    return { type: 'phase_completed', phase }
  }
}
