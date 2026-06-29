import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { Feature } from '../../file-state/types'

export class PhaseAHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_A) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)

    if (!activeFeature) {
      console.error('\n✗ Error: No active feature found in backlog to process.')
      return Phase.HALTED
    }

    context.updateState({ activeFeatureId: activeFeature.id })

    if (this.hasCascadeBlock(activeFeature, features)) return Phase.CASCADE_BLOCKED

    await this.runScopeRefinement(activeFeature, context)

    if (!context.checkSpecFilesPresent(activeFeature.domain)) return Phase.PHASE_A

    await this.ensureTasksAppended(activeFeature, context)

    return Phase.PHASE_B
  }

  // Returns true when any direct dependency is BLOCKED, triggering a cascade.
  private hasCascadeBlock(feature: Feature, allFeatures: Feature[]): boolean {
    return feature.dependencies.some(depId => {
      const dep = allFeatures.find(f => f.id === depId)
      return dep?.status === 'BLOCKED'
    })
  }

  // Delegates scope-refinement to the software-architect agent and marks the feature IN_PROGRESS.
  private async runScopeRefinement(feature: Feature, context: PhaseContext): Promise<void> {
    context.fsm.updateFeatureStatus(feature.id, 'IN_PROGRESS')

    const config = context.fsm.loadBootstrapConfig()
    const payload = ContextAssembler.buildPhaseAPayload(
      feature,
      context.config.projectPaths,
      context.config.scope,
      config.steeringRules,
    )
    await context.invokeAgent({
      skill: 'scope-refinement',
      agent: 'software-architect',
      mode: 'autonomous',
      payload,
      phaseKey: 'phase_a',
    })
  }

  // Appends dev tasks to DEVELOPMENT-STATE.md, falling back to a targeted agent call
  // if the tactical-design file was written but the JSON block is unreadable by the parser.
  private async ensureTasksAppended(feature: Feature, context: PhaseContext): Promise<void> {
    const existing = context.fsm.loadDevelopmentState().filter(t => t.featureId === feature.id)
    if (existing.length > 0) return

    let extracted = context.extractTasksFromTacticalDesign(feature.domain)

    if (extracted.length === 0) {
      extracted = await this.recoverTasksViaAgent(feature, context)
    }

    if (extracted.length === 0) {
      throw new Error(
        `Phase A failed: no tasks extracted for feature ${feature.id} (domain '${feature.domain}'). ` +
          `Verify that docs/specs/${feature.domain}/003-*-tactical-design.md contains a valid JSON array under "## Section 6 — Ordered Development Tasks".`,
      )
    }

    const projectName = context.config.projectPaths[0]?.split('/').pop() ?? 'project'
    context.fsm.appendTasks(
      extracted.map(t => ({
        featureId: feature.id,
        taskId: t.taskId,
        project: projectName,
        description: t.description,
        domain: feature.domain,
        currentPhase: '-' as const,
        status: 'NOT_STARTED' as const,
      })),
    )
  }

  // Last-resort recovery: asks the agent to read the 003 doc and write the missing rows
  // directly into DEVELOPMENT-STATE.md, then re-runs the local parser.
  private async recoverTasksViaAgent(
    feature: Feature,
    context: PhaseContext,
  ): Promise<Array<{ taskId: string; description: string }>> {
    const projectName = context.config.projectPaths[0]?.split('/').pop() ?? 'project'
    await context.invokeAgent({
      agent: 'software-architect',
      mode: 'autonomous',
      phaseKey: 'phase_a_task_extraction',
      payload: {},
      prompt: [
        `Read docs/specs/${feature.domain}/003-*-tactical-design.md.`,
        `Locate "## Section 6 — Ordered Development Tasks" and parse the JSON array in the fenced code block immediately following it.`,
        `For each task object, append a row to docs/product/DEVELOPMENT-STATE.md using this format:`,
        `| ${feature.id} | T<zero-padded id> | <project> | <title> | ${feature.domain} | - | NOT_STARTED |`,
        `where <project> is the last folder segment of the project path: ${projectName}.`,
        `Do not output anything else.`,
      ].join(' '),
    })
    return context.extractTasksFromTacticalDesign(feature.domain)
  }
}
