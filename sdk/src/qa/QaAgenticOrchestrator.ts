import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import { QaService } from './services/QaService'
import { QaRunStore } from './services/QaRunStore'
import { QaAnalysisPhase, QaExecutionPhase, QaPhase, QaPlanningPhase, QaReportingPhase, QaValidationPhase, type QaPhaseContext, type QaPhaseHandler } from './phases'
import type { QaAgenticRequest, QaDriver, QaFinalReport, QaPlan, QaRun } from './types'
import type { HarnessSettings } from '../settings/HarnessSettings'
import type { QaProgressEvent, QaProgressListener } from './progress'
import { QaRuntimeManager, type QaRuntimePreparer } from './services/QaRuntimeManager'
import type { QaTargetProbe } from './services/QaTargetProbe'
import { QaExecutionMemory } from './services/QaExecutionMemory'

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
  readonly #memory: QaExecutionMemory

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
    this.#memory = new QaExecutionMemory(options.workspace)
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

  async report(plan: QaPlan, run: QaRun, signal?: AbortSignal): Promise<QaFinalReport> {
    const handler = this.#phases.get(QaPhase.REPORTING)
    if (!handler) throw new Error(`No agentic QA handler for phase ${QaPhase.REPORTING}`)
    const context: QaPhaseContext = {
      ...this.#context,
      request: { target: plan.target, profile: plan.profile },
      plan,
      run,
      persistPlan: false,
    }
    context.onProgress?.({ type: 'phase_started', phase: QaPhase.REPORTING })
    const next = await handler.execute(context, signal)
    context.onProgress?.(this.phaseCompleted(QaPhase.REPORTING, context))
    if (next !== QaPhase.COMPLETED || !context.report) throw new Error('Agentic QA reporting completed without a final report')
    return context.report
  }

  private async runFrom(start: QaPhase, request: QaAgenticRequest, plan?: QaPlan, signal?: AbortSignal): Promise<QaFinalReport> {
    const runtime = await this.#runtime.prepare(request, signal)
    const resolvedRequest = runtime ? { ...request, target: runtime.target } : request
    if (runtime) this.#context.onProgress?.({ type: 'runtime_ready', target: runtime.target, managed: runtime.managed })
    try {
      const context: QaPhaseContext = {
        ...this.#context, request: resolvedRequest, plan, persistPlan: start === QaPhase.PLANNING,
        executionMemory: this.#memory.read(resolvedRequest.profile, resolvedRequest.target),
      }
      let current = start
      while (current !== QaPhase.COMPLETED) {
        const handler = this.#phases.get(current)
        if (!handler) throw new Error(`No agentic QA handler for phase ${current}`)
        context.onProgress?.({ type: 'phase_started', phase: current })
        const completed = current
        try {
          current = await handler.execute(context, signal)
        } catch (error) {
          if (current !== QaPhase.ANALYSIS || !context.run?.verdict || signal?.aborted) throw error
          context.onProgress?.({ type: 'phase_warning', phase: QaPhase.ANALYSIS,
            reason: `Adaptive analysis skipped: ${error instanceof Error ? error.message : String(error)}. Reporting executed results.` })
          current = QaPhase.REPORTING
        }
        context.onProgress?.(this.phaseCompleted(completed, context))
      }
      if (!context.report) throw new Error('Agentic QA completed without a final report')
      if (context.plan && context.run) {
        try { this.#memory.remember(context.plan, context.run, runtime?.managed) } catch {
          context.onProgress?.({ type: 'phase_warning', reason: 'Execution memory could not be saved; the QA report is available.' })
        }
      }
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
