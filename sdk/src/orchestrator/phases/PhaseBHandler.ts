import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { Feature, Task } from '../../file-state/types'

export class PhaseBHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_B) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase PHASE_B requires an active feature but none is set`)

    const tddOutputPath = join(context.workingDir, 'docs', 'specs', activeFeature.domain, 'TDD-OUTPUT.json')

    // 1. If TDD-OUTPUT.json exists, handle any IN_PROGRESS tasks that were finished
    const shouldGoToPhaseC = this.handleResumedExecution(activeFeature, tddOutputPath, context)
    if (shouldGoToPhaseC) {
      return Phase.PHASE_C
    }

    // 2. Load latest non-completed tasks
    const currentTasks = context.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
    const nonCompletedTasks = currentTasks.filter(t => t.status !== 'COMPLETED')

    if (nonCompletedTasks.length === 0) {
      return Phase.PHASE_C
    }

    // 3. Paginate: 4 tasks per run
    const CHUNK_SIZE = 4
    const chunkTasks = nonCompletedTasks.slice(0, CHUNK_SIZE)

    await this.executeChunk(activeFeature, chunkTasks, tddOutputPath, context)

    // 4. Post-execution: if TDD-OUTPUT.json exists, complete the current chunk
    if (existsSync(tddOutputPath)) {
      const allDone = this.completeChunk(activeFeature, chunkTasks, tddOutputPath, context)
      return allDone ? Phase.PHASE_C : Phase.PHASE_B
    }

    return Phase.PHASE_B
  }

  private handleResumedExecution(activeFeature: Feature, tddOutputPath: string, context: PhaseContext): boolean {
    const allTasks = context.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
    const inProgressTasks = allTasks.filter(t => t.status === 'IN_PROGRESS')

    if (existsSync(tddOutputPath) && inProgressTasks.length > 0) {
      for (const task of inProgressTasks) {
        context.fsm.updateTaskStatus(activeFeature.id, task.taskId, '-', 'COMPLETED')
      }

      const remainingTasks = context.fsm.loadDevelopmentState().filter(
        t => t.featureId === activeFeature.id && t.status !== 'COMPLETED'
      )
      if (remainingTasks.length > 0) {
        // More tasks remain, delete the tdd-output and continue in Phase B
        rmSync(tddOutputPath)
      } else {
        // No more tasks remain, transition to Phase C
        return true
      }
    }
    return false
  }

  private async executeChunk(activeFeature: Feature, chunkTasks: Task[], tddOutputPath: string, context: PhaseContext): Promise<void> {
    // Delete any stale tdd-output before invoking agent to ensure it runs
    if (existsSync(tddOutputPath)) {
      rmSync(tddOutputPath)
    }

    // Mark current chunk tasks as IN_PROGRESS
    for (const task of chunkTasks) {
      context.fsm.updateTaskStatus(activeFeature.id, task.taskId, 'IMPLEMENTATION', 'IN_PROGRESS')
    }

    const isRetry = activeFeature.reworks > 0
    const config = context.fsm.loadBootstrapConfig()
    const payload = ContextAssembler.buildPhaseBPayload(
      activeFeature,
      chunkTasks,
      context.config.projectPaths,
      isRetry,
      config.steeringRules
    )

    await context.invokeAgent({
      skill: 'tdd-orchestrator',
      agent: 'developer-backend',
      mode: 'autonomous',
      payload,
      phaseKey: 'phase_b',
    })
  }

  private completeChunk(activeFeature: Feature, chunkTasks: Task[], tddOutputPath: string, context: PhaseContext): boolean {
    for (const task of chunkTasks) {
      context.fsm.updateTaskStatus(activeFeature.id, task.taskId, '-', 'COMPLETED')
    }

    const remainingTasks = context.fsm.loadDevelopmentState().filter(
      t => t.featureId === activeFeature.id && t.status !== 'COMPLETED'
    )
    if (remainingTasks.length > 0) {
      // More tasks remain, delete the tdd-output and continue in Phase B
      rmSync(tddOutputPath)
      return false
    }
    return true
  }
}
