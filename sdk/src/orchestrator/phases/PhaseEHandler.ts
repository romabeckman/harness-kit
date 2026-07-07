import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { PhaseEPayload } from '../../context-assembler/types'

export class PhaseEHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_E) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)

    const config = context.fsm.loadBootstrapConfig()
    const decisions = context.fsm.loadRecentDecisions(5)
    const payload = ContextAssembler.buildPhaseEPayload(
      activeFeature,
      context.config.projectPaths,
      config.cycleCounter.completedCycles,
      decisions,
      config.steeringRules
    )

    const prompt = this.buildProjectMemoryPrompt(payload)

    await context.invokeAgent({
      skill: 'project-memory',
      agent: 'software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'phase_e',
    })

    return Phase.PHASE_F
  }

  private buildProjectMemoryPrompt(payload: PhaseEPayload): string {
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const decisionsList = payload.recentDecisions.length > 0
      ? payload.recentDecisions.map(d => `- ${d}`).join('\n')
      : '- No decisions recorded this cycle'
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
        ? payload.steeringRules.map(r => `- ${r}`).join('\n')
        : '- No additional rules provided'

    return [
      `## Objective`,
      `Persist project memory for domain \`${payload.domain}\` after cycle ${payload.completedCycles}. Update or create \`docs/feature/[FEATURE_NAME].md\` and any relevant ADR files.`,
      `Each project must have its own \`docs/adr\` and \`docs/feature\` folders where all ADRs and features are stored.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/project-memory\` skill before starting.`,
      `You are operating as the \`software-architect\` agent.`,
      `</skill_context>`,
      ``,
      `<inputs>`,
      ``,
      `<feature>`,
      `Domain: ${payload.domain}`,
      `Scope description: ${payload.scopeDescription}`,
      `Completed cycles: ${payload.completedCycles}`,
      `</feature>`,
      ``,
      `<recent_decisions>`,
      decisionsList,
      `</recent_decisions>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `</inputs>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<instructions>`,
      `- Each project must have its own \`docs/adr\` and \`docs/feature\` folders where all ADRs and features are stored.`,
      `- REQUIRED: Document the developed feature under \`docs/feature/[FEATURE_NAME].md\` (create if missing, update if it exists the same or relevant previous feature), following \`./references/DOCUMENT-TEMPLATE.md\` strictly`,
      `- REQUIRED: \`FOLDER STRUCTURE\` section must reflect the module's current relevant structure, incorporating paths added or modified this cycle — do not drop paths from prior cycles`,
      `- REQUIRED: All cross-references MUST point ONLY to \`./docs/adr/\` or \`./docs/feature/\` — validate every reference before finalizing`,
      `- REQUIRED: Keep all content direct and minimal — enough for a future LLM to orient itself without re-reading source files`,
      `- IF architectural changes were introduced (new layers, patterns, integrations, test strategy changes) → update the corresponding \`docs/adr/*.md\` file following its rules file`,
      `- PROHIBITED: TDD/validation/score details in feature docs — those belong in DECISIONS.md only`,
      `- PROHIBITED: Narrative explanations, justifications, or process history`,
      `- PROHIBITED: Creating a new ADR file unless explicitly requested by a human`,
      `- PROHIBITED: Reading, creating, or modifying any file under \`docs/harness-history/\``,
      `</instructions>`,
      ``,
      `<strict_rules>`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- Only \`docs/adr/\` and \`docs/feature/\` may be created or modified inside \`docs/\``,
      `</strict_rules>`,
    ].join('\n')
  }
}
