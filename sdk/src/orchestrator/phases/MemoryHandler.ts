import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { PhaseEPayload } from '../../context-assembler/types'
import { join } from 'node:path'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'

export class MemoryHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.MEMORY) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)

    // --skip-steering: bypass project-memory agent and jump straight to Phase F
    if (context.config.skipSteering) {
      process.stdout.write(`[phase_memory] --skip-steering active — skipping project-memory for feature ${activeFeature.id}\n`)
      return Phase.DEPLOY
    }

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

    const prompt = this.buildProjectMemoryPrompt(payload, context)

    await context.invokeAgent({
      skill: 'harness-kit:project-memory',
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'memory',
    })

    PhaseDecisionLogger.logPhaseE(context.fsm, activeFeature, context.config.projectPaths)

    return Phase.DEPLOY
  }

  private buildProjectMemoryPrompt(payload: PhaseEPayload, context: PhaseContext): string {
    const backlogFile = join(context.workingDir, 'docs', 'product', 'BACKLOG.md')
    const specsPattern = join(context.workingDir, 'docs', 'product', 'specs', '[domain]', '*.md')
    const projectPathsList = payload.projectPaths.map(p => `- ${p}`).join('\n')
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
        ? payload.steeringRules.map(r => `- ${r}`).join('\n')
        : '- No additional rules provided'

    // Static-first ordering: everything that doesn't change between invocations
    // goes before the variable blocks (scope, project_paths, rules), so those
    // can share a single cached prefix across calls (cacheReadTokens instead
    // of cacheCreationTokens on repeat invocations within the same run).
    return [
      `## Objective`,
      `Persist development memory for the current development scope. Organize documents by topic; avoid redundant or repetitive text.`,
      `Each project must have its own \`docs/adr\` and \`docs/feature\` folders where all ADRs and features are stored.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/harness-kit:project-memory\` skill before starting.`,
      `</skill_context>`,
      ``,
      `<instructions>`,
      ``,
      `## Workflow`,
      `1. Execute autonomously without pausing or asking for confirmation.`,
      `2. Invoke the \`/harness-kit:project-memory\` skill and read \`./references/DOCUMENT-TEMPLATE.md\` before writing anything.`,
      `3. Read \`${backlogFile}\` to identify the specification \`Domain\`. Use it to place/locate the feature doc at \`${specsPattern}\`.`,
      `4. If an existing document already covers this feature's changes, fixes, updates or improvements, update that file. Otherwise, create a new one.`,
      `5. If architectural changes were introduced (new layers, patterns, integrations, test strategy changes), update the corresponding \`docs/adr/*.md\` file following its own rules file.`,
      ``,
      `## File Organization`,
      `- Each project listed in \`<project_paths>\` must have its own \`docs/adr/\` and \`docs/feature/\` folders. These are the ONLY directories allowed for creation or modification inside \`docs/\`.`,
      `- Specification docs (SDD) live at \`${specsPattern}\`, grouped by the \`Domain\` column from BACKLOG.md.`,
      `- Feature docs can live directly as \`docs/feature/FEATURE_NAME.md\` or grouped as \`docs/feature/[domain]/FEATURE_NAME.md\`.`,
      `- NAMING: New filenames MUST be UPPER_CASE (e.g. \`FEATURE_NAME.md\`). NEVER prefix filenames with feature IDs such as F001, F002, etc.`,
      ``,
      `## Content Rules`,
      `- Follow \`./references/DOCUMENT-TEMPLATE.md\` strictly for structure and formatting.`,
      `- Write for a future LLM with no access to source files: state what the feature does, why it exists, key decisions, constraints — never how it was implemented step-by-step.`,
      `- AVOID code snippets. Only include one when prose cannot convey it (public interface signature, fixed schema, non-obvious config key), and keep it to a few lines. Never paste full functions, classes, or file contents — reference the file path instead.`,
      `- The \`FOLDER STRUCTURE\` section must reflect the module's current relevant structure, adding this cycle's paths without dropping paths from prior cycles.`,
      `- All cross-references MUST point ONLY to \`./docs/adr/\` or \`./docs/feature/\` — validate every reference before finalizing.`,
      ``,
      `## Prohibited`,
      `- NEVER include TDD/validation/score details in feature docs — those belong in DECISIONS.md only.`,
      `- NEVER add narrative explanations, justifications, or process history. \`TODO\`-style notes for future implementation are the only exception, and only in specification or decision files.`,
      `- NEVER create a new ADR file unless explicitly requested by a human.`,
      `- NEVER read, create, or modify any file under \`docs/harness-history/\`.`,
      ``,
      `## Optional`,
      `- Run \`git status -s\` to list all modified files in each project.`,
      ``,
      `</instructions>`,
      ``,
      `<scope>`,
      `\`\`\`markdown`,
      context.config.scope.trim(),
      `\`\`\``,
      `</scope>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
    ].join('\n')
  }
}
