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
    if (!activeFeature) throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)

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

    const agent = activeFeature.layer ? 'harness-kit:developer-' + activeFeature.layer : 'harness-kit:developer-backend'
    const prompt = this.buildTddOrchestratorPrompt(payload, context, agent)

    await context.invokeAgent({
      skill: 'harness-kit:tdd-orchestrator',
      agent,
      mode: 'autonomous',
      prompt,
      phaseKey: 'phase_b',
    })
  }

  private buildTddOrchestratorPrompt(payload: PhaseBPayload, context: PhaseContext, agent: string): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const tasksList = payload.tasks.map(t => `- [${t.taskId}] ${t.description}`).join('\n')
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
        ? payload.steeringRules.map(r => `- ${r}`).join('\n')
        : '- No additional rules provided'

    const workingDir = join(context.workingDir, 'docs', 'specs', payload.domain)

    let tasksSection = ''
    let reworkSection = ''
    if (payload.isRetry) {
      const reworkLogPath = join(workingDir, 'REWORK-LOG.md')

      reworkSection = [
        `<rework>`,
        `You are working in a fixes from previous runs. Read the file \`${reworkLogPath}\` with tech lead and qa feedback.`,
        ``,
        `MANDATORY STEPS:`,
        `1. Read \`${reworkLogPath}\` completely — every item is a required fix.`,
        `2. For EACH action items":`,
        `   a. Write a FAILING test that reproduces the issue described`,
        `   b. Implement the minimal fix to make the test pass`,
        `   c. Set checked \`[X]\` when you're done in item`,
        `3. For EACH vulnerability listed:`,
        `   a. Write a test that proves the vulnerability exists`,
        `   b. Fix the code to pass the security test`,
        `   c. Set checked \`[X]\` when you're done in vulnerability`,
        `4. For EACH edge case missed:`,
        `   a. Write a test for the edge case`,
        `   b. Implement handling for the edge case`,
        `   c. Set checked \`[X]\` when you're done in case`,
        `5. Architecture tips: evaluate and implement if relevant`,
        `6. Run ALL tests (old + new) — all must pass`,
        `7. Work on \`[ ] FIX\` for each pending task.`,
        ``,
        `DO NOT modify existing passing tests to force compliance.`,
        `DO NOT skip any item from REWORK-LOG.md.`,
        `</rework>`,
        ``,
      ].join('\n')
    } else {
      tasksSection = [
        `<tasks>`,
        tasksList,
        `</tasks>`,
        ``,
      ].join('\n')
    }

    return [
      `## Objective`,
      `Execute the TDD workflow for the tasks listed below. Follow steps 1, 2, 3, 4 and 6 of the \`harness-kit:tdd-orchestrator\` skill sequentially without pausing.`,
      ``,
      reworkSection,
      `<skill_context>`,
      `Invoke the \`harness-kit:tdd-orchestrator\` skill before starting.`,
      `</skill_context>`,
      `<inputs>`,
      ``,
      `<feature>`,
      `Feature ID: ${payload.featureId}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</feature>`,
      tasksSection,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<development_specifications>`,
      `- Problem: \`${workingDir}/001-problem-space.md\``,
      `- Context: \`${workingDir}/002-context-map.md\``,
      `- Tactical design: \`${workingDir}/003-*-tactical-design.md\``,
      `- Test scenarios: \`${workingDir}/004-*-test-scenarios.md\``,
      `</development_specifications>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `</inputs>`,
      ``,
      `<expected_output>`,
      `Write \`${workingDir}/TDD-OUTPUT.json\` upon completion:`,
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
      `- You MUST read \`docs/README.md\` (It is a guide to all the documents; load them into memory as needed), \`docs/adr/ARCHITECTURE.md\`, and \`docs/adr/TESTS.md\` in each project before writing any code`,
      `- Each project MUST have its own \`docs/adr\` and \`docs/feature\` folders where all ADRs and features are stored.`,
      `- If exists "Socratic Questions" section in \`001-problem-space.md\`, use it to reflect and write the code in the best possible way.`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- NEVER change correct tests to force passing`,
      `- NEVER run package installation commands automatically — instruct the user instead`,
      `- CRITICAL: You MUST NOT run \`step 5\` (Update Documentation)`,
      `</strict_rules>`,
    ].join('\n')
  }
}
