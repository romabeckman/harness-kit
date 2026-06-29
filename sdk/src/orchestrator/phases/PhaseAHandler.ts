import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { Feature } from '../../file-state/types'
import type { PhaseAPayload } from '../../context-assembler/types'

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

    const prompt = this.buildScopeRefinementPrompt(payload)

    await context.invokeAgent({
      skill: 'scope-refinement',
      agent: 'software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'phase_a',
    })
  }

  private buildScopeRefinementPrompt(payload: PhaseAPayload): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
        ? payload.steeringRules.map(r => `- ${r}`).join('\n')
        : '- No additional rules provided'

    return [
      `## Objective`,
      `Perform scope refinement for the feature described below. Produce all required spec files under \`docs/specs/${payload.domain}/\`.`,
      ``,
      `<inputs>`,
      ``,
      `<scope>`,
      payload.scope,
      `</scope>`,
      ``,
      `<feature>`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</feature>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `</inputs>`,
      ``,
      `<expected_outputs>`,
      `Produce, under \`docs/specs/${payload.domain}/\` (one file per project for phases 3 and 4, where \${PROJECT_NAME} = root folder name of each project path):`,
      `- \`docs/specs/${payload.domain}/001-problem-space.md\` — Strategic Design: Domain Events, Subdomains, Ubiquitous Language, Socratic Questions`,
      `- \`docs/specs/${payload.domain}/002-context-map.md\` — Bounded Contexts and Context Map`,
      `- \`docs/specs/${payload.domain}/003-\${PROJECT_NAME}-tactical-design.md\` (one per project) — Tactical Design; must include \`## Section 6 — Ordered Development Tasks\` with a fenced JSON array of \`{ id, title }\` objects`,
      `- \`docs/specs/${payload.domain}/004-\${PROJECT_NAME}-test-scenarios.md\` (one per project) — Test Scenarios`,
      `</expected_outputs>`,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- Write every file to disk before advancing to the next`,
      `- Do NOT output explanations — produce the spec files only`,
      `</strict_rules>`,
    ].join('\n')
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
      skill: 'scope-refinement',
      agent: 'software-architect',
      mode: 'autonomous',
      phaseKey: 'phase_a',
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
