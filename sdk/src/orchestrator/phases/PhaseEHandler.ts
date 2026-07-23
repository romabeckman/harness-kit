import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { PhaseEPayload } from '../../context-assembler/types'
import { join } from 'node:path'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'

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
      skill: 'harness-kit:project-memory',
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'phase_e',
    })

    PhaseDecisionLogger.logPhaseE(context.fsm, activeFeature, context.config.projectPaths)

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
      `Invoke the \`/harness-kit:project-memory\` skill before starting.`,
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
      ``,
      `## Workflow`,
      `1. Execute autonomously without pausing or asking for confirmation.`,
      `2. Invoke the \`/harness-kit:project-memory\` skill and read \`./references/DOCUMENT-TEMPLATE.md\` before writing anything.`,
      `3. List existing files under each project's \`docs/feature/\` folder.`,
      `4. If an existing document already covers this feature's topic, update that file. Otherwise, create a new one.`,
      `5. If architectural changes were introduced (new layers, patterns, integrations, test strategy changes), update the corresponding \`docs/adr/*.md\` file following its own rules file.`,
      ``,
      `## File Organization`,
      `- Each project listed in \`<project_paths>\` must have its own \`docs/adr/\` and \`docs/feature/\` folders. These are the ONLY directories allowed for creation or modification inside \`docs/\`.`,
      `- Feature docs can live directly as \`docs/feature/FEATURE_NAME.md\` or in subfolders \`docs/feature/[group]/FEATURE_NAME.md\`.`,
      `- NAMING: New filenames MUST be UPPER_CASE (e.g. \`FEATURE_NAME.md\`). NEVER prefix filenames with feature IDs such as F001, F002, etc.`,
      ``,
      `## Content Rules`,
      `- Follow \`./references/DOCUMENT-TEMPLATE.md\` strictly for structure and formatting.`,
      `- Keep all content direct and minimal — enough for a future LLM to orient itself without re-reading source files.`,
      `- The \`FOLDER STRUCTURE\` section must reflect the module's current relevant structure, incorporating paths added or modified this cycle — do not drop paths from prior cycles.`,
      `- All cross-references MUST point ONLY to \`./docs/adr/\` or \`./docs/feature/\` — validate every reference before finalizing.`,
      ``,
      `## Prohibited`,
      `- NEVER include TDD/validation/score details in feature docs — those belong in DECISIONS.md only.`,
      `- NEVER add narrative explanations, justifications, or process history. Only \`TODO\`-style notes for future implementation are permitted, and only in specification or decision files.`,
      `- NEVER create a new ADR file unless explicitly requested by a human.`,
      `- NEVER read, create, or modify any file under \`docs/harness-history/\`.`,
      ``,
      `## Optional`,
      `- Run \`git status -s\` to list all modified files in each project.`,
      ``,
      `</instructions>`,
    ].join('\n')
  }
}
