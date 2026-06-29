import { existsSync, rmSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { Feature, Task } from '../../file-state/types'
import type { PhaseBPayload } from '../../context-assembler/types'

export class PhaseBHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_B) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase PHASE_B requires an active feature but none is set`)

    const tddOutputPath = join(context.workingDir, 'docs', 'specs', activeFeature.domain, 'TDD-OUTPUT.json')
    const tempJsonlPath = join(context.workingDir, 'docs', 'specs', activeFeature.domain, 'TDD-OUTPUT-TEMP.jsonl')

    // 1. If TDD-OUTPUT.json exists, handle any IN_PROGRESS tasks that were finished
    const shouldGoToPhaseC = this.handleResumedExecution(activeFeature, tddOutputPath, context)
    if (shouldGoToPhaseC) {
      return Phase.PHASE_C
    }

    // Clean stale temp file only if starting a completely fresh run (no tasks COMPLETED)
    const allTasks = context.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
    const inProgressTasks = allTasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'NOT_STARTED')

    // If no tasks are completed or in progress, it's safe to clean up temp files from a previous crashed run.
    if (inProgressTasks.length === 0 && existsSync(tempJsonlPath)) {
      rmSync(tempJsonlPath)
    }

    const CHUNK_SIZE = 4
    let iterations = 0
    const MAX_ITERATIONS = 100

    while (true) {
      if (iterations++ > MAX_ITERATIONS) {
        throw new Error(`PhaseBHandler: exceeded maximum iteration limit of ${MAX_ITERATIONS} — possible infinite loop.`)
      }

      // 2. Load latest non-completed tasks
      const currentTasks = context.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
      const nonCompletedTasks = currentTasks.filter(t => t.status !== 'COMPLETED')

      if (nonCompletedTasks.length === 0) {
        this.consolidateTempOutputs(tempJsonlPath, tddOutputPath)
        return Phase.PHASE_C
      }

      // 3. Paginate: 4 tasks per run
      const chunkTasks = nonCompletedTasks.slice(0, CHUNK_SIZE)

      await this.executeChunk(activeFeature, chunkTasks, tddOutputPath, context)

      // 4. Post-execution: if TDD-OUTPUT.json exists, complete the current chunk
      if (existsSync(tddOutputPath)) {
        // Append chunk output to temp jsonl file
        try {
          const chunkData = readFileSync(tddOutputPath, 'utf8')
          JSON.parse(chunkData) // verify valid JSON
          appendFileSync(tempJsonlPath, chunkData.trim().replace(/\r?\n/g, '') + '\n', 'utf8')
        } catch (err: any) {
          process.stderr.write(`Failed to append chunk data: ${err.message}\n`)
        }

        const allDone = this.completeChunk(activeFeature, chunkTasks, tddOutputPath, context)
        if (allDone) {
          this.consolidateTempOutputs(tempJsonlPath, tddOutputPath)
          return Phase.PHASE_C
        }
      } else {
        // If TDD-OUTPUT.json doesn't exist, execution failed or was aborted
        return Phase.PHASE_B
      }
    }
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

    const prompt = this.buildTddOrchestratorPrompt(payload)

    await context.invokeAgent({
      skill: 'tdd-orchestrator',
      agent: 'developer-backend',
      mode: 'autonomous',
      prompt,
      phaseKey: 'phase_b',
    })
  }

  private buildTddOrchestratorPrompt(payload: PhaseBPayload): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const tasksList = payload.tasks.map(t => `- [${t.taskId}] ${t.description}`).join('\n')
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
        ? payload.steeringRules.map(r => `- ${r}`).join('\n')
        : '- No additional rules provided'

    const reworkSection = payload.isRetry
      ? [
          ``,
          `<rework>`,
          `This is a RETRY run. Read \`docs/specs/${payload.domain}/REWORK-LOG.md\` before starting.`,
          `- Translate every vulnerability and missed edge case from REWORK-LOG.md into new failing test cases`,
          `- Address all architectural questions and open points listed there alongside the tactical tasks`,
          `</rework>`,
        ].join('\n')
      : ''

    return [
      `## Objective`,
      `Execute the TDD workflow for the tasks listed below. Follow steps 1–6 of the tdd-orchestrator skill sequentially without pausing.`,
      ``,
      `<inputs>`,
      ``,
      `<feature>`,
      `Feature ID: ${payload.featureId}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</feature>`,
      ``,
      `<tasks>`,
      tasksList,
      `</tasks>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<spec_sources>`,
      `- Implementation blueprint: \`docs/specs/${payload.domain}/003-*-tactical-design.md\``,
      `- Test scenarios (drives RED phase): \`docs/specs/${payload.domain}/004-*-test-scenarios.md\``,
      `</spec_sources>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `</inputs>`,
      reworkSection,
      ``,
      `<expected_output>`,
      `Write \`docs/specs/${payload.domain}/TDD-OUTPUT.json\` upon completion:`,
      `\`\`\`json`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "status": "SUCCESS" | "FAILED",`,
      `  "metrics": { "totalTests": 0, "passed": 0, "failed": 0, "coverage": 0.00 },`,
      `  "modifiedFiles": ["relative/path/to/file"],`,
      `  "reworksCount": ${payload.isRetry ? 1 : 0}`,
      `}`,
      `\`\`\``,
      `</expected_output>`,
      ``,
      `<strict_rules>`,
      `- Read \`docs/README.md\`, \`docs/adr/ARCHITECTURE.md\`, and \`docs/adr/TESTS.md\` before writing any code`,
      `- Invoke test-driven-development skill before any production code — verify tests FAIL first`,
      `- Invoke verification-before-completion before declaring any task complete`,
      `- Invoke systematic-debugging before attempting any fix on failing tests`,
      `- Never change correct tests to force passing`,
      `- Never run package installation commands automatically — instruct the user instead`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `</strict_rules>`,
    ].join('\n')
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

  private consolidateTempOutputs(tempJsonlPath: string, tddOutputPath: string): void {
    if (!existsSync(tempJsonlPath)) {
      return
    }

    try {
      const lines = readFileSync(tempJsonlPath, 'utf8').split('\n').filter(l => l.trim())
      let consolidatedOutput: any = null
      for (const line of lines) {
        try {
          const chunkData = JSON.parse(line)
          consolidatedOutput = this.mergeTddOutputs(consolidatedOutput, chunkData)
        } catch {
          // ignore parsing error
        }
      }
      if (consolidatedOutput) {
        writeFileSync(tddOutputPath, JSON.stringify(consolidatedOutput, null, 2), 'utf8')
      }
      rmSync(tempJsonlPath)
    } catch (err: any) {
      process.stderr.write(`Failed to consolidate temp outputs: ${err.message}\n`)
    }
  }

  private mergeTddOutputs(target: any, source: any): any {
    if (!target) return { ...source }

    const merged = { ...target }
    if (source.featureId) merged.featureId = source.featureId

    // Status: FAILED takes precedence over SUCCESS
    if (source.status === 'FAILED' || target.status === 'FAILED') {
      merged.status = 'FAILED'
    } else if (source.status) {
      merged.status = source.status
    }

    // Metrics
    const targetMetrics = target.metrics || {}
    const sourceMetrics = source.metrics || {}
    merged.metrics = {
      totalTests: (targetMetrics.totalTests || 0) + (sourceMetrics.totalTests || 0),
      passed: (targetMetrics.passed || 0) + (sourceMetrics.passed || 0),
      failed: (targetMetrics.failed || 0) + (sourceMetrics.failed || 0),
      coverage: Math.max(targetMetrics.coverage || 0, sourceMetrics.coverage || 0),
    }

    // Modified files: union
    const targetFiles = Array.isArray(target.modifiedFiles) ? target.modifiedFiles : []
    const sourceFiles = Array.isArray(source.modifiedFiles) ? source.modifiedFiles : []
    merged.modifiedFiles = Array.from(new Set([...targetFiles, ...sourceFiles]))

    // Reworks
    merged.reworksCount = Math.max(target.reworksCount || 0, source.reworksCount || 0)

    // Custom test tasksCompleted
    if (typeof source.tasksCompleted === 'number' || typeof target.tasksCompleted === 'number') {
      merged.tasksCompleted = (target.tasksCompleted || 0) + (source.tasksCompleted || 0)
    }

    return merged
  }
}
