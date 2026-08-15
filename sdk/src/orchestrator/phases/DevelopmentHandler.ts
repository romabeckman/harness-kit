import { existsSync, rmSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import {
  inlineOrReference,
  buildDocsOrientationSection,
  formatRulesSection,
  formatProjectPathsList,
  formatTasksList,
} from '../utils/PromptHelpers'
import { getSpecsDir } from '../utils/PhaseFileUtils'
import type { Feature, Task } from '../../file-state/types'
import type { DevelopmenPayload } from '../../context-assembler/types'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'

export class DevelopmentHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.DEVELOPMENT) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)

    const tddOutputPath = join(getSpecsDir(context.workingDir, activeFeature.domain), 'TDD-OUTPUT.json')
    let pendingTasks = context.fsm.getPendingTasks(activeFeature.id)

    const shouldGoToReview = this.shouldGoToReview(activeFeature, tddOutputPath, context, pendingTasks)
    if (shouldGoToReview) {
      return Phase.REVIEW
    }

    await this.executeChunk(activeFeature, pendingTasks, tddOutputPath, context)
    return Phase.REVIEW
  }

  private shouldGoToReview(activeFeature: Feature, tddOutputPath: string, context: Reviewontext, pendingTasks: Task[]): boolean {
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

  private async executeChunk(activeFeature: Feature, chunkTasks: Task[], tddOutputPath: string, context: Reviewontext): Promise<void> {
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

    PhaseDecisionLogger.logDevelopmen(context.fsm, activeFeature, tddOutputPath)
  }

  buildTddOrchestratorPrompt(payload: DevelopmenPayload, context: Reviewontext, agent: string, continuation: boolean = false): string {
    if (payload.isRetry) {
      return this.buildReworkPrompt(payload, context, { continuation }, agent)
    }
    return this.buildDevelopmentPrompt(payload, context, agent)
  }

  buildDevelopmentPrompt(payload: DevelopmenPayload, context: Reviewontext, _agent?: string): string {
    const projectPathsList = formatProjectPathsList(payload.projectPaths)
    const tasksList = formatTasksList(payload.tasks)
    const rulesSection = formatRulesSection(payload.steeringRules)

    const workingDir = getSpecsDir(context.workingDir, payload.domain)
    const orientationSection = buildDocsOrientationSection(payload.projectPaths, context.workingDir)

    const tasksSection = [
      `<tasks>`,
      tasksList,
      `</tasks>`,
      ``,
    ].join('\n')

    return [
      `## Objective`,
      `Execute the TDD workflow for the tasks listed below. Follow steps 1, 2, 3, 4 and 6 of the \`harness-kit:tdd-orchestrator\` skill sequentially without pausing.`,
      ``,
      `<skill_context>`,
      `Invoke the \`harness-kit:tdd-orchestrator\` skill before starting.`,
      `Mode: autonomous`,
      `</skill_context>`,
      ``,
      `<react_workflow>`,
      `- THOUGHT: Analyze the TDD cycle step (RED/GREEN/REFACTOR).`,
      `- ACTION: Write code or execute tests in the terminal.`,
      `- OBSERVATION: Analyze console outputs and errors to adjust the code.`,
      `</react_workflow>`,
      ``,
      `<strict_rules>`,
      `- You MUST read \`docs/.digest.md\` and \`docs/.graph.json\` (or fallback to \`docs/README.md\`, \`docs/adr/ARCHITECTURE.md\`, and \`docs/adr/TESTS.md\`) in each project before writing any code`,
      `- Each project MUST have its own \`docs/adr\` and \`docs/feature\` folders where all ADRs and features are stored.`,
      `- If exists "Socratic Questions" section in the problem space, use it to reflect and write the code in the best possible way.`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- NEVER change correct tests to force passing`,
      `- NEVER run package installation commands automatically — instruct the user instead`,
      `- CRITICAL: You MUST NOT run \`step 5\` (Update Documentation)`,
      `</strict_rules>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<expected_output>`,
      `Write \`${workingDir}/TDD-OUTPUT.json\` upon completion:`,
      `\`\`\`json`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "status": "SUCCESS",`,
      `  "metrics": { "totalTests": 0, "passed": 0, "failed": 0, "coverage": 0.00 },`,
      `  "modifiedFiles": ["relative/path/to/file"],`,
      `  "reworksCount": ${payload.reworks}`,
      `}`,
      `\`\`\``,
      `Allowed status values are \`SUCCESS\` and \`FAILED\`. Use \`SUCCESS\` only when every required test passes and \`metrics.failed\` is 0.`,
      `</expected_output>`,
      ``,
      `<development_specifications>`,
      ...this.buildSpecsSection(payload, context.workingDir),
      `</development_specifications>`,
      ``,
      `<inputs>`,
      ...orientationSection,
      `<feature>`,
      `Feature ID: ${payload.featureId}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</feature>`,
      ``,
      tasksSection,
      `</inputs>`,
    ].join('\n')
  }

  buildReworkPrompt(payload: DevelopmenPayload, context: Reviewontext, options: { continuation: boolean }, agent?: string): string {
    if (options.continuation) {
      return this.buildContinuationReworkPrompt(payload, context)
    }
    return this.buildStandaloneReworkPrompt(payload, context, agent)
  }

  buildStandaloneReworkPrompt(payload: DevelopmenPayload, context: Reviewontext, _agent?: string): string {
    const projectPathsList = formatProjectPathsList(payload.projectPaths)
    const tasksList = formatTasksList(payload.tasks)
    const rulesSection = formatRulesSection(payload.steeringRules)

    const workingDir = getSpecsDir(context.workingDir, payload.domain)
    const orientationSection = buildDocsOrientationSection(payload.projectPaths, context.workingDir)

    const tasksSection = [
      `<tasks>`,
      tasksList,
      `</tasks>`,
      ``,
    ].join('\n')

    const reworkSection = this.buildReworkSection(payload, context)

    return [
      `## Objective`,
      `Execute the TDD workflow for the tasks listed below. Follow steps 1, 2, 3, 4 and 6 of the \`harness-kit:tdd-orchestrator\` skill sequentially without pausing.`,
      ``,
      `<skill_context>`,
      `Invoke the \`harness-kit:tdd-orchestrator\` skill before starting.`,
      `Mode: autonomous`,
      `</skill_context>`,
      ``,
      `<react_workflow>`,
      `- THOUGHT: Analyze the TDD cycle step (RED/GREEN/REFACTOR).`,
      `- ACTION: Write code or execute tests in the terminal.`,
      `- OBSERVATION: Analyze console outputs and errors to adjust the code.`,
      `</react_workflow>`,
      ``,
      `<strict_rules>`,
      `- You MUST read \`docs/.digest.md\` and \`docs/.graph.json\` (or fallback to \`docs/README.md\`, \`docs/adr/ARCHITECTURE.md\`, and \`docs/adr/TESTS.md\`) in each project before writing any code`,
      `- Each project MUST have its own \`docs/adr\` and \`docs/feature\` folders where all ADRs and features are stored.`,
      `- If exists "Socratic Questions" section in the problem space, use it to reflect and write the code in the best possible way.`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- NEVER change correct tests to force passing`,
      `- NEVER run package installation commands automatically — instruct the user instead`,
      `- CRITICAL: You MUST NOT run \`step 5\` (Update Documentation)`,
      `</strict_rules>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<expected_output>`,
      `Write \`${workingDir}/TDD-OUTPUT.json\` upon completion:`,
      `\`\`\`json`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "status": "SUCCESS",`,
      `  "metrics": { "totalTests": 0, "passed": 0, "failed": 0, "coverage": 0.00 },`,
      `  "modifiedFiles": ["relative/path/to/file"],`,
      `  "reworksCount": ${payload.reworks}`,
      `}`,
      `\`\`\``,
      `Allowed status values are \`SUCCESS\` and \`FAILED\`. Use \`SUCCESS\` only when every required test passes and \`metrics.failed\` is 0.`,
      `</expected_output>`,
      ``,
      `<development_specifications>`,
      ...this.buildSpecsSection(payload, context.workingDir),
      `</development_specifications>`,
      ``,
      `<inputs>`,
      ...orientationSection,
      `<feature>`,
      `Feature ID: ${payload.featureId}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</feature>`,
      ``,
      reworkSection,
      tasksSection,
      `</inputs>`,
    ].join('\n')
  }

  buildContinuationReworkPrompt(payload: DevelopmenPayload, context: Reviewontext): string {
    const tasksList = formatTasksList(payload.tasks)
    const workingDir = getSpecsDir(context.workingDir, payload.domain)
    const reworkSection = this.buildReworkSection(payload, context)

    const tasksSection = [
      `<tasks>`,
      tasksList,
      `</tasks>`,
      ``,
    ].join('\n')

    return [
      `## Objective`,
      `Address the findings from the latest review. Follow steps 1, 2, 3, 4 and 6 of the \`harness-kit:tdd-orchestrator\` skill sequentially without pausing.`,
      ``,
      `<skill_context>`,
      `Invoke the \`harness-kit:tdd-orchestrator\` skill before starting.`,
      `Mode: autonomous`,
      `</skill_context>`,
      ``,
      `<react_workflow>`,
      `- THOUGHT: Analyze the TDD cycle step (RED/GREEN/REFACTOR).`,
      `- ACTION: Write code or execute tests in the terminal.`,
      `- OBSERVATION: Analyze console outputs and errors to adjust the code.`,
      `</react_workflow>`,
      ``,
      `<strict_rules>`,
      `- For EACH item in \`REWORK-LOG.md\`, reproduce the issue with a new failing test before implementing the minimal fix`,
      `- Run all tests (old + new) — all must pass`,
      `- NEVER change correct tests to force passing`,
      `- NEVER run package installation commands automatically — instruct the user instead`,
      `- CRITICAL: You MUST NOT run \`step 5\` (Update Documentation)`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `</strict_rules>`,
      ``,
      reworkSection,
      tasksSection,
      `<expected_output>`,
      `Write \`${workingDir}/TDD-OUTPUT.json\` upon completion:`,
      `\`\`\`json`,
      `{`,
      `  "featureId": "${payload.featureId}",`,
      `  "status": "SUCCESS",`,
      `  "metrics": { "totalTests": 0, "passed": 0, "failed": 0, "coverage": 0.00 },`,
      `  "modifiedFiles": ["relative/path/to/file"],`,
      `  "reworksCount": ${payload.reworks}`,
      `}`,
      `\`\`\``,
      `Allowed status values are \`SUCCESS\` and \`FAILED\`. Use \`SUCCESS\` only when every required test passes and \`metrics.failed\` is 0.`,
      `</expected_output>`,
    ].join('\n')
  }

  private buildReworkSection(payload: DevelopmenPayload, context: Reviewontext): string {
    const workingDir = join(context.workingDir, 'docs', 'specs', payload.domain)
    const reworkLogPath = payload.reworkLogPath
      ? resolve(context.workingDir, payload.reworkLogPath)
      : join(workingDir, 'REWORK-LOG.md')
    const reworkLogContent = existsSync(reworkLogPath) ? readFileSync(reworkLogPath, 'utf8') : ''
    return [
      `<rework>`,
      `You are fixing findings from previous runs. Read \`${reworkLogPath}\` for Tech Lead and QA feedback.`,
      ``,
      ...inlineOrReference('rework_log_content', reworkLogContent, reworkLogPath, 'markdown', 'always'),
      ``,
      `MANDATORY STEPS:`,
      `1. Read \`${reworkLogPath}\` completely — every item is a required fix.`,
      `2. For EACH action item:`,
      `   a. Write a FAILING test that reproduces the issue described`,
      `   b. Implement the minimal fix to make the test pass`,
      `   c. Mark the item \`[X]\` when complete`,
      `3. For EACH vulnerability listed:`,
      `   a. Write a test that proves the vulnerability exists`,
      `   b. Fix the code to pass the security test`,
      `   c. Mark the vulnerability \`[X]\` when complete`,
      `4. For EACH edge case missed:`,
      `   a. Write a test for the edge case`,
      `   b. Implement handling for the edge case`,
      `   c. Mark the edge case \`[X]\` when complete`,
      `5. Architecture tips: evaluate and implement if relevant`,
      `6. Run ALL tests (old + new) — all must pass`,
      `7. Work on \`[ ] FIX\` for each pending task.`,
      ``,
      `DO NOT modify existing passing tests to force compliance.`,
      `DO NOT skip any item from REWORK-LOG.md.`,
      `</rework>`,
      ``,
    ].join('\n')
  }

  private buildSpecsSection(payload: DevelopmenPayload, workingDir: string): string[] {
    const specsDir = join(workingDir, 'docs', 'specs', payload.domain)
    const specs = payload.specsContent
    if (!specs) return []

    const sections: string[] = []

    if (!payload.isRetry) {
      sections.push(...inlineOrReference('problem_space', specs.problemSpace, join(specsDir, '001-problem-space.md'), 'markdown'))
      sections.push(...inlineOrReference('context_map', specs.contextMap, join(specsDir, '002-context-map.md'), 'markdown'))
    }

    sections.push(...inlineOrReference('tactical_design', specs.tacticalDesign, join(specsDir, '003-*-tactical-design.md'), 'markdown', 'always'))
    sections.push(...inlineOrReference('test_scenarios', specs.testScenarios, join(specsDir, '004-*-test-scenarios.md'), 'markdown', 'always'))

    return sections
  }
}
