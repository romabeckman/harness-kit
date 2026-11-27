import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { DevelopmenPayload } from '../../context-assembler/types'
import type { Feature, Task } from '../../file-state/types'
import { DevelopmentPromptService } from '../services/DevelopmentPromptService'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import { TddOutputService } from '../services/TddOutputService'
import { Phase } from '../types'
import type { TddOutput } from '../utils/PhaseFileUtils'
import { AbstractPhaseHandler, type Reviewontext } from './AbstractPhaseHandler'

export class DevelopmentHandler extends AbstractPhaseHandler {
  private readonly prompts = new DevelopmentPromptService()

  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.DEVELOPMENT) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)

    const tddOutput = new TddOutputService(context.workingDir, activeFeature)
    const pendingTasks = context.fsm.getPendingTasks(activeFeature.id)
    const featureTasks = context.fsm.loadDevelopmentState().filter(task => task.featureId === activeFeature.id)
    if (!featureTasks.length) throw new Error(`Development requires planned tasks for feature ${activeFeature.id}.`)

    let tasks = pendingTasks
    if (!this.canResumeReview(activeFeature, tddOutput, context, pendingTasks)) {
      if (!tasks.length) tasks = featureTasks
      const canCompleteTasks = await this.executeDevelopment(activeFeature, tasks, tddOutput, context)
      if (!canCompleteTasks) return Phase.REVIEW
    }
    try {
      tddOutput.readCompleted()
      for (const task of tasks) {
        context.fsm.updateTaskStatus(activeFeature.id, task.taskId, '-', 'COMPLETED')
      }
    } catch {
      // Review owns the disposition of incomplete or invalid TDD results.
    }
    return Phase.REVIEW
  }

  private canResumeReview(feature: Feature, tddOutput: TddOutputService, context: Reviewontext, pendingTasks: Task[]): boolean {
    if (pendingTasks.length === 0) {
      return context.fsm.loadDevelopmentState().every(task => task.featureId !== feature.id || task.status === 'COMPLETED')
    }
    let output: TddOutput
    try {
      output = tddOutput.readCompleted()
    } catch {
      return false
    }
    return context.dreaming?.canResume(feature, output, pendingTasks) ?? false
  }

  private async executeDevelopment(activeFeature: Feature, chunkTasks: Task[], tddOutput: TddOutputService, context: Reviewontext): Promise<boolean> {
    const clearedPreviousReport = tddOutput.clear(context)

    // Mark current chunk tasks as IN_PROGRESS
    for (const task of chunkTasks) {
      context.fsm.updateTaskStatus(activeFeature.id, task.taskId, 'IMPLEMENTATION', 'IN_PROGRESS')
    }

    const isRetry = activeFeature.reworks > 0
    const config = context.fsm.loadBootstrapConfig()

    const payload = ContextAssembler.buildDevelopmenPayload(
      activeFeature,
      context.workingDir,
      chunkTasks,
      context.config.projectPaths,
      isRetry,
      activeFeature.reworks,
      config.steeringRules
    )

    const agent = activeFeature.layer ? 'harness-kit:developer-' + activeFeature.layer : 'harness-kit:developer-backend'

    // Check for compatible developer session on retry
    const developerSession = isRetry
      ? context.getDeveloperSession?.(agent, activeFeature.id, Phase.DEVELOPMENT)
      : undefined

    const prompt = this.buildTddOrchestratorPrompt(payload, context, agent, Boolean(developerSession))

    const output = await context.invokeAgent({
      skill: 'harness-kit:tdd-orchestrator',
      agent,
      mode: 'autonomous',
      prompt,
      payload: { featureId: activeFeature.id, domain: activeFeature.domain, reworksCount: activeFeature.reworks },
      phaseKey: 'implementation',
      domain: activeFeature.domain,
      ...(developerSession ? { session: developerSession } : {}),
    })

    if (output.session) {
      context.setDeveloperSession?.({
        featureId: activeFeature.id,
        agent,
        session: output.session,
        phase: Phase.DEVELOPMENT,
      })
    }

    if (clearedPreviousReport) {
      PhaseDecisionLogger.logDevelopmen(context.fsm, activeFeature, tddOutput.path)
      tddOutput.recordDevelopment(context, chunkTasks, output.session?.id)
    }
    if (output.success === false) {
      context.fsm.appendDecision({ featureId: activeFeature.id, decision: 'Development agent reported an unsuccessful execution' })
    }
    return clearedPreviousReport && output.success !== false
  }

  buildTddOrchestratorPrompt(payload: DevelopmenPayload, context: Reviewontext, agent: string, continuation: boolean = false): string {
    if (payload.isRetry) {
      return this.buildReworkPrompt(payload, context, { continuation }, agent)
    }
    return this.buildDevelopmentPrompt(payload, context, agent)
  }

  buildDevelopmentPrompt(payload: DevelopmenPayload, context: Reviewontext, _agent?: string): string {
    return this.prompts.buildDevelopmentPrompt(payload, context)
  }

  buildReworkPrompt(payload: DevelopmenPayload, context: Reviewontext, options: { continuation: boolean }, agent?: string): string {
    if (options.continuation) {
      return this.buildContinuationReworkPrompt(payload, context)
    }
    return this.buildStandaloneReworkPrompt(payload, context, agent)
  }

  buildStandaloneReworkPrompt(payload: DevelopmenPayload, context: Reviewontext, _agent?: string): string {
    return this.prompts.buildStandaloneReworkPrompt(payload, context)
  }

  buildContinuationReworkPrompt(payload: DevelopmenPayload, context: Reviewontext): string {
    return this.prompts.buildContinuationReworkPrompt(payload, context)
  }
}
