import { Phase } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { MemoryPayload } from '../../context-assembler/types'
import { join } from 'node:path'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import {
  buildDocsOrientationSection,
  formatRulesSection,
  formatProjectPathsList,
} from '../utils/PromptHelpers'
import { getProductDir } from '../utils/PhaseFileUtils'

export class MemoryHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.MEMORY) {
      return super.handle(phase, context)
    }

    // --skip-memory: bypass project-memory agent and jump straight to Phase F
    if (context.config.skipMemory) {
      process.stdout.write(`[phase_memory] --skip-memory active — skipping project-memory\n`)
      return Phase.DEPLOY
    }

    const config = context.fsm.loadBootstrapConfig();
    const payload = ContextAssembler.buildMemoryPayload(
      context.config.projectPaths,
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

    PhaseDecisionLogger.logMemory(context.fsm, context.config.projectPaths)

    return Phase.DEPLOY
  }

  private buildProjectMemoryPrompt(payload: MemoryPayload, context: Reviewontext): string {
    const backlogFile = join(getProductDir(context), 'BACKLOG.md')
    const specsPattern = join(context.workingDir, 'docs', 'specs', '[domain]', '*.md')
    const projectPathsList = formatProjectPathsList(payload.projectPaths)
    const rulesSection = formatRulesSection(payload.steeringRules)

    const orientationSection = buildDocsOrientationSection(payload.projectPaths, context.workingDir)

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
      `Invoke the \`harness-kit:project-memory\` skill before starting.`,
      `Mode: autonomous`,
      `</skill_context>`,
      ``,
      `<instructions>`,
      ``,
      `## Workflow`,
      `1. Execute autonomously without pausing or asking for confirmation.`,
      `2. Invoke the \`harness-kit:project-memory\` skill and read \`./references/DOCUMENT-TEMPLATE.md\` before writing anything.`,
      `3. Read \`${backlogFile}\` to identify completed features and their \`Domain\` values, then read the corresponding specification sources at \`${specsPattern}\`. Update feature documentation inside each target project, not inside the specification directory.`,
      `4. If an existing document already covers this feature's changes, fixes, updates or improvements, update that file. Otherwise, create a new one.`,
      `5. If architectural changes were introduced (new layers, patterns, integrations, test strategy changes), update the corresponding \`docs/adr/*.md\` file following its own rules file.`,
      `6. Update \`docs/.digest.md\` and \`docs/.graph.json\` at the end of the operation.`,
      ``,
      `## File Organization`,
      `- Each project listed in \`<project_paths>\` must have its own \`docs/adr/\` and \`docs/feature/\` folders. Create or modify topic documents only in those folders; root documentation indexes such as \`README.md\`, \`docs/README.md\`, \`docs/.digest.md\`, and \`docs/.graph.json\` may also be updated.`,
      `- Specification docs (SDD) live at \`${specsPattern}\`, grouped by the \`Domain\` column from BACKLOG.md.`,
      `- Feature docs live directly under \`docs/feature/*.md\`. Preserve an existing project naming convention; otherwise default to a stable domain-based filename such as \`docs/feature/<domain>.md\`. Never prefix filenames with feature IDs such as F001 or F002.`,
      ``,
      `## Content Rules`,
      `- Follow \`./references/DOCUMENT-TEMPLATE.md\` strictly for structure and formatting.`,
      `- Write for a future LLM with no access to source files: state what the feature does, why it exists, key decisions, constraints — never how it was implemented step-by-step.`,
      `- AVOID code snippets. Only include one when prose cannot convey it (public interface signature, fixed schema, non-obvious config key), and keep it to a few lines. Never paste full functions, classes, or file contents — reference the file path instead.`,
      `- The \`FOLDER STRUCTURE\` section must reflect the module's current relevant structure, adding this cycle's paths without dropping paths from prior cycles.`,
      `- Cross-references between topic documents must target files under the project's \`docs/adr/\` or \`docs/feature/\` folders and use a correct relative path from the source document. Validate every reference before finalizing.`,
      ``,
      `## Prohibited`,
      `- NEVER include TDD/validation/score details in feature docs — those belong in DECISIONS.md only.`,
      `- NEVER add process history or speculative future-work notes.`,
      `- NEVER create a new ADR file unless explicitly requested by a human.`,
      `- NEVER read, create, or modify any file under \`docs/harness-history/\`.`,
      ``,
      `## Optional`,
      `- Run \`git status -s\` to list all modified files in each project.`,
      ``,
      `</instructions>`,
      ``,
      ...orientationSection,
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
