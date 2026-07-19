import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { PhaseEPayload } from '../../context-assembler/types'
import { join } from 'node:path'

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
      context.workingDir,
      config.steeringRules
    )

    const prompt = this.buildProjectMemoryPrompt(payload)

    await context.invokeAgent({
      skill: 'project-memory',
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'phase_e',
    })

    return Phase.PHASE_F
  }

  private buildProjectMemoryPrompt(payload: PhaseEPayload): string {
    const specsDir = join(payload.workingDir, 'docs', 'specs', payload.domain)
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
        ? payload.steeringRules.map(r => `- ${r}`).join('\n')
        : '- No additional rules provided'

    return [
      `## Objective`,
      `Persist development memory for domain \`${payload.domain}\`. You must organize documents by topic and avoid redundant or repetitive text.`,
      `Each project must have its own \`docs/adr\` and \`docs/feature\` folders where all ADRs and features are stored.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/project-memory\` skill before starting.`,
      `</skill_context>`,
      ``,
      `<inputs>`,
      ``,
      `<feature>`,
      `Domain: ${payload.domain}`,
      `Scope description: ${payload.scopeDescription}`,
      `Specification documents: ${specsDir}`,
      `</feature>`,
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
      `- Frist check if exists similar, create if missing, update if it exists the same or relevant previous feature, following \`./references/DOCUMENT-TEMPLATE.md\` strictly.`,
      `- IF architectural changes were introduced (new layers, patterns, integrations, test strategy changes) → update the corresponding \`docs/adr/*.md\` file following its rules file`,
      `- If necessary, you can create subfolders under \`docs/feature/[group]/[FEATURE_NAME]\` with similar naming convention for features or directly \`docs/feature/[FEATURE_NAME]\`.`,
      `- Execute autonomously without pausing or asking for confirmation`,
      `- CRITICAL: Only \`docs/adr/\` and \`docs/feature/\` may be created or modified inside \`docs/\``,
      `- CRITICAL: Each project must have its own \`docs/adr\` and \`docs/feature\` folders where all ADRs and features are stored.`,
      `- REQUIRED: \`FOLDER STRUCTURE\` section must reflect the module's current relevant structure, incorporating paths added or modified this cycle — do not drop paths from prior cycles`,
      `- REQUIRED: All cross-references MUST point ONLY to \`./docs/adr/\` or \`./docs/feature/\` — validate every reference before finalizing`,
      `- REQUIRED: Keep all content direct and minimal — enough for a future LLM to orient itself without re-reading source files`,
      `- PROHIBITED: TDD/validation/score details in feature docs — those belong in DECISIONS.md only`,
      `- PROHIBITED: Narrative explanations, justifications, or process history. Only \`TODO\`-style notes for future implementation are permitted, provided they are in specification or decision files.`,
      `- PROHIBITED: Creating a new ADR file unless explicitly requested by a human`,
      `- PROHIBITED: Reading, creating, or modifying any file under \`docs/harness-history/\``,
      `- OPTIONAL: Run \`git status -s\` to list all modified files in each project.`,
      `</instructions>`,
    ].join('\n')
  }
}
