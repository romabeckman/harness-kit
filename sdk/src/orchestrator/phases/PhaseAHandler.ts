import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'

export class PhaseAHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_A) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)

    if (!activeFeature) {
      return Phase.HALTED
    }

    const blocked = activeFeature.dependencies.some(depId => {
      const dep = features.find(f => f.id === depId)
      return dep?.status === 'BLOCKED'
    })
    if (blocked) return Phase.CASCADE_BLOCKED

    context.fsm.updateFeatureStatus(activeFeature.id, 'IN_PROGRESS')

    const config = context.fsm.loadBootstrapConfig()
    const payload = ContextAssembler.buildPhaseAPayload(
      activeFeature,
      context.config.projectPaths,
      context.config.scope,
      config.steeringRules
    )
    await context.invokeAgent({
      skill: 'scope-refinement',
      agent: 'software-architect',
      mode: 'autonomous',
      payload,
      phaseKey: 'phase_a',
    })

    const specFilesPresent = context.checkSpecFilesPresent(activeFeature.domain)
    if (!specFilesPresent) return Phase.PHASE_A

    const existingTasks = context.fsm.loadDevelopmentState()
      .filter(t => t.featureId === activeFeature.id)
    if (existingTasks.length === 0) {
      const extracted = context.extractTasksFromTacticalDesign(activeFeature.domain)
      const projectName = context.config.projectPaths[0]?.split('/').pop() ?? 'project'
      const tasks = extracted.map(t => ({
        featureId: activeFeature.id,
        taskId: t.taskId,
        project: projectName,
        description: t.description,
        domain: activeFeature.domain,
        currentPhase: '-' as const,
        status: 'NOT_STARTED' as const,
      }))
      if (tasks.length > 0) context.fsm.appendTasks(tasks)
    }

    return Phase.PHASE_B
  }
}
