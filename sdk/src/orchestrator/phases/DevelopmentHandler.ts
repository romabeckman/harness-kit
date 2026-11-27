import { loadPrompt } from '../utils/PromptTemplate'
import { existsSync, rmSync, readFileSync, writeFileSync, appendFileSync, renameSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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
import { getPlanningSource, getSpecsDir, readCompletedTddOutput, readTddOutput } from '../utils/PhaseFileUtils'
import type { TddOutput } from '../utils/PhaseFileUtils'
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
    const pendingTasks = context.fsm.getPendingTasks(activeFeature.id)
    const featureTasks = context.fsm.loadDevelopmentState().filter(task => task.featureId === activeFeature.id)
    if (!featureTasks.length) throw new Error(`Development requires planned tasks for feature ${activeFeature.id}.`)

    let tasks = pendingTasks
    if (!this.canResumeReview(activeFeature, tddOutputPath, context, pendingTasks)) {
      if (!tasks.length) tasks = featureTasks
      await this.executeChunk(activeFeature, tasks, tddOutputPath, context)
    }
    try {
      readCompletedTddOutput(tddOutputPath, activeFeature.id, activeFeature.reworks)
      for (const task of tasks) {
        context.fsm.updateTaskStatus(activeFeature.id, task.taskId, '-', 'COMPLETED')
      }
    } catch {
      // Review owns the disposition of incomplete or invalid TDD results.
    }
    return Phase.REVIEW
  }

  private canResumeReview(feature: Feature, path: string, context: Reviewontext, pendingTasks: Task[]): boolean {
    if (!existsSync(path)) return false
    let output: TddOutput
    try {
      output = readCompletedTddOutput(path, feature.id, feature.reworks)
    } catch {
      return false
    }
    if (pendingTasks.length === 0) {
      return context.fsm.loadDevelopmentState().every(task => task.featureId !== feature.id || task.status === 'COMPLETED')
    }
    return context.dreaming?.canResume(feature, output, pendingTasks) ?? false
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

    PhaseDecisionLogger.logDevelopmen(context.fsm, activeFeature, tddOutputPath)
    if (output.success === false) throw new Error('Development agent failed before a verified TDD-OUTPUT.json was accepted.')
    let reported: TddOutput
    try {
      reported = readTddOutput(tddOutputPath)
    } catch (error) {
      context.fsm.appendDecision({ featureId: activeFeature.id, decision: 'Development: TDD output requires review', rationale: String(error) })
      return
    }
    if (reported.featureId === activeFeature.id && reported.reworksCount !== activeFeature.reworks) {
      const original = JSON.parse(readFileSync(tddOutputPath, 'utf8'))
      original.reworksCount = activeFeature.reworks
      const temporaryPath = `${tddOutputPath}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporaryPath, JSON.stringify(original, null, 2) + '\n', 'utf8')
        renameSync(temporaryPath, tddOutputPath)
      } finally {
        rmSync(temporaryPath, { force: true })
      }
      context.fsm.appendDecision({
        featureId: activeFeature.id,
        decision: 'Development: corrected TDD-OUTPUT.json reworksCount mismatch',
        rationale: `TDD-OUTPUT.json reported ${reported.reworksCount}, expected ${activeFeature.reworks}.`,
      })
      reported.reworksCount = activeFeature.reworks
    }
    try {
      readCompletedTddOutput(tddOutputPath, activeFeature.id, activeFeature.reworks)
    } catch (error) {
      context.fsm.appendDecision({ featureId: activeFeature.id, decision: 'Development: TDD output requires review', rationale: String(error) })
    }
    if (reported.featureId === activeFeature.id) {
      context.dreaming?.recordDevelopment(activeFeature, reported, chunkTasks, context.config.projectPaths, output.session?.id)
    }
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
    const orientationSection = buildDocsOrientationSection(payload.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

    const tasksSection = [
      `<tasks>`,
      tasksList,
      `</tasks>`,
      ``,
    ].join('\n')

    return loadPrompt('development/initial', {
      redGuidance: loadPrompt('development/red-guidance', {}),
      rulesSection: rulesSection,
      projectPathsList: projectPathsList,
      workingDir: workingDir,
      featureId: payload.featureId,
      reworks: payload.reworks,
      specsSection: this.buildSpecsSection(payload, context.workingDir, context.config.agentRunner),
      orientationSection: orientationSection,
      featureId2: payload.featureId,
      featureTitle: payload.featureTitle,
      domain: payload.domain,
      tasksSection: tasksSection,
    })
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
    const orientationSection = buildDocsOrientationSection(payload.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

    const tasksSection = [
      `<tasks>`,
      tasksList,
      `</tasks>`,
      ``,
    ].join('\n')

    const reworkSection = this.buildReworkSection(payload, context)

    return loadPrompt('development/rework', {
      redGuidance: loadPrompt('development/red-guidance', {}),
      rulesSection: rulesSection,
      projectPathsList: projectPathsList,
      workingDir: workingDir,
      featureId: payload.featureId,
      reworks: payload.reworks,
      specsSection: this.buildSpecsSection(payload, context.workingDir, context.config.agentRunner),
      orientationSection: orientationSection,
      featureId2: payload.featureId,
      featureTitle: payload.featureTitle,
      domain: payload.domain,
      reworkSection: reworkSection,
      tasksSection: tasksSection,
    })
  }

  buildContinuationReworkPrompt(payload: DevelopmenPayload, context: Reviewontext): string {
    const tasksList = formatTasksList(payload.tasks)
    const workingDir = getSpecsDir(context.workingDir, payload.domain)
    const planningSource = getPlanningSource(context)
    const projectPathsList = formatProjectPathsList(payload.projectPaths)
    const reworkSection = this.buildReworkSection(payload, context)

    const tasksSection = [
      `<tasks>`,
      tasksList,
      `</tasks>`,
      ``,
    ].join('\n')

    return loadPrompt('development/continuation', {
      redGuidance: loadPrompt('development/red-guidance', {}),
      featureId: payload.featureId,
      featureTitle: payload.featureTitle,
      label: planningSource.label,
      path: planningSource.path,
      workingDir: workingDir,
      projectPathsList: projectPathsList,
      reworkSection: reworkSection,
      tasksSection: tasksSection,
      workingDir2: workingDir,
      featureId2: payload.featureId,
      reworks: payload.reworks,
    })
  }

  private buildReworkSection(payload: DevelopmenPayload, context: Reviewontext): string {
    const workingDir = join(context.workingDir, 'docs', 'specs', payload.domain)
    const reworkLogPath = payload.reworkLogPath
      ? resolve(context.workingDir, payload.reworkLogPath)
      : join(workingDir, 'REWORK-LOG.md')
    const reworkLogContent = existsSync(reworkLogPath) ? readFileSync(reworkLogPath, 'utf8') : ''
    return loadPrompt('development/rework-section', {
      reworkLogPath: reworkLogPath,
      reworkLogContentSection: inlineOrReference('rework_log_content', reworkLogContent, reworkLogPath, 'markdown', 'always', context.config.agentRunner),
      reworkLogPath2: reworkLogPath,
    }) + '\n'
  }

  private buildSpecsSection(payload: DevelopmenPayload, workingDir: string, activeRunner?: Reviewontext['config']['agentRunner']): string[] {
    const specsDir = join(workingDir, 'docs', 'specs', payload.domain)
    const specs = payload.specsContent
    if (!specs) return []

    const sections: string[] = [
      `<specification_provenance>`,
      `- 001/002 are domain-wide context shared by all projects in this feature.`,
      `- Each 003/004 file is project-specific; \`<!-- File: ... -->\` markers identify ownership when content is concatenated.`,
      `- Match each task's [project] tag to its project path and owning 003/004 artifacts.`,
      `</specification_provenance>`,
    ]

    if (!payload.isRetry) {
      sections.push(...inlineOrReference('problem_space', specs.problemSpace, join(specsDir, '001-problem-space.md'), 'markdown', 'never', activeRunner))
      sections.push(...inlineOrReference('context_map', specs.contextMap, join(specsDir, '002-context-map.md'), 'markdown', 'never', activeRunner))
    }

    sections.push(...inlineOrReference('tactical_design', specs.tacticalDesign, join(specsDir, '003-*-tactical-design.md'), 'markdown', 'always', activeRunner))
    sections.push(...inlineOrReference('test_scenarios', specs.testScenarios, join(specsDir, '004-*-test-scenarios.md'), 'markdown', 'always', activeRunner))

    return sections
  }
}
