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

    let pendingTasks = context.fsm.getPendingTasks(activeFeature.id)

    const shouldGoToPhaseC = this.shouldGoToPhaseC(activeFeature, tddOutputPath, context, pendingTasks)

    if (shouldGoToPhaseC) {
      return Phase.PHASE_C
    }

    await this.executeChunk(activeFeature, pendingTasks, tddOutputPath, context)
    return Phase.PHASE_C
  }

  private shouldGoToPhaseC(activeFeature: Feature, tddOutputPath: string, context: PhaseContext, pendingTasks: Task[]): boolean {
    if (existsSync(tddOutputPath)) {
      if (pendingTasks.length > 0) {
        for (const task of pendingTasks) {
          context.fsm.updateTaskStatus(activeFeature.id, task.taskId, '-', 'COMPLETED')
        }
      }

      return true
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
      activeFeature.reworks,
      config.steeringRules
    )

    const agent = activeFeature.layer ? 'developer-' + activeFeature.layer : 'developer-backend'
    const prompt = this.buildTddOrchestratorPrompt(payload, agent)

    await context.invokeAgent({
      skill: 'tdd-orchestrator',
      agent,
      mode: 'autonomous',
      prompt,
      phaseKey: 'phase_b',
    })
  }

  private buildTddOrchestratorPrompt(payload: PhaseBPayload, agent: string): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const tasksList = payload.tasks.map(t => `- [${t.taskId}] (${t.project}) ${t.description}`).join('\n')
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
      `<skill_context>`,
      `Invoke the \`/tdd-orchestrator\` skill before starting.`,
      `You are operating as the \`${agent}\` agent.`,
      `</skill_context>`,
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
      `- Problem: \`docs/specs/${payload.domain}/001-problem-space.md\``,
      `- Context: \`docs/specs/${payload.domain}/002-context-map.md\``,
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
      `  "reworksCount": ${payload.reworks}`,
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
}
