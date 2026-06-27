import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'

export class PhaseBHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_B) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase PHASE_B requires an active feature but none is set`)

    const tddOutputPath = join(context.workingDir, 'docs', 'specs', activeFeature.domain, 'TDD-OUTPUT.json')

    if (existsSync(tddOutputPath)) {
      const allTasks = context.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
      for (const task of allTasks) {
        if (task.status !== 'COMPLETED') {
          context.fsm.updateTaskStatus(activeFeature.id, task.taskId, '-', 'COMPLETED')
        }
      }
      return Phase.PHASE_C
    }

    const tasks = context.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
    for (const task of tasks) {
      if (task.status === 'NOT_STARTED') {
        context.fsm.updateTaskStatus(activeFeature.id, task.taskId, 'IMPLEMENTATION', 'IN_PROGRESS')
      }
    }

    const isRetry = activeFeature.reworks > 0
    const payload = ContextAssembler.buildPhaseBPayload(
      activeFeature,
      tasks,
      context.config.projectPaths,
      isRetry
    )
    await context.invokeAgent({
      skill: 'tdd-orchestrator',
      agent: 'developer-backend',
      mode: 'autonomous',
      payload,
    })

    if (existsSync(tddOutputPath)) {
      const allTasks = context.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
      for (const task of allTasks) {
        context.fsm.updateTaskStatus(activeFeature.id, task.taskId, '-', 'COMPLETED')
      }
      return Phase.PHASE_C
    }

    return Phase.PHASE_B
  }
}
