import { join } from 'node:path'
import { Phase, CliCommand } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import { buildDocsOrientationSection } from '../utils/PromptHelpers'

export class BootstrapHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.BOOTSTRAP) {
      return super.handle(phase, context)
    }

    context.fsm.ensureProductFiles(context.config)

    const bootConfig = context.fsm.loadBootstrapConfig()

    if (context.config.cliCommand === CliCommand.INIT) {
      bootConfig.projectPaths = context.config.projectPaths
      if (context.config.score !== undefined) {
        bootConfig.scoreThresholdTL = context.config.score
        bootConfig.scoreThresholdAdv = context.config.score
      }
      if (context.config.reworks !== undefined) {
        bootConfig.completionCriteria = {
          maxReworks: context.config.reworks
        }
      }
      if (context.config?.initialRules) {
        if (!bootConfig?.steeringRules) bootConfig.steeringRules = { 'user': [] }
        if (!bootConfig?.steeringRules?.user) bootConfig.steeringRules.user = []
        bootConfig.steeringRules.user.push(context.config.initialRules)
      }
      context.fsm.saveBootstrapConfig(bootConfig)
    }

    const existing = context.fsm.loadBacklog()
    const shouldRefine = context.config.enableRefinement && !context.fsm.existRefinement()

    if (existing.length > 0) return shouldRefine ? Phase.REFINEMENT : Phase.PLANNING

    const productDir = context.config.productDir ?? join(context.workingDir, 'docs', 'product')
    const backlogPath = join(productDir, 'BACKLOG.md')

    const rulesList: string[] = []
    if (bootConfig && bootConfig.steeringRules) {
      const configRules = bootConfig.steeringRules
      if (configRules.bootstrap && configRules.bootstrap.length > 0) {
        for (const r of configRules.bootstrap) {
          rulesList.push(r.toLowerCase().startsWith('bootstrap') ? r : `Bootstrap: ${r}`)
        }
      }
      if (configRules.user && configRules.user.length > 0) {
        rulesList.push(...configRules.user)
      }
    }

    const promptLines = [
      `# ROLE`,
      `You are software architect defining the backlog of a project. Understand the project scope and generate a \`BACKLOG.md\` table with all the features of the project.`,
      ``,
      `# OBJECTIVE`,
      `Parse the project scope below and generate a \`BACKLOG.md\` table. Write it to: \`${backlogPath}\``,
      ``,
      `# OUTPUT FORMAT`,
      `Table columns (exact):`,
      `| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |`,
      ``,
      `# COLUMN RULES`,
      `- ID: F001, F002, ... (sequential, no gaps)`,
      `- Title: short description with objective (max 500 chars)`,
      `- Domain: is unique, never repeat, snake_case, max 50 characters`,
      `- Agent: \`backend\` | \`frontend\` | \`qa\` | \`devops\` — infer from feature scope and project paths`,
      `- Priority: CRITICAL (only if mission-critical, core functionality, or security), HIGH, MEDIUM, or LOW`,
      `- Dependencies: comma-separated IDs, or None`,
      `- Reworks: 0 | Score (TL) & Score (Adv): - | Status: NOT_STARTED`,
      `- Output ONLY the markdown table, no additional text.`,
      ``,
      `# FEATURE SIZING`,
      `Each feature has fixed pipeline overhead: scope refinement → TDD → tech lead review → QA review → documentation (4-7 agent calls per feature). Broader scope still increases context, testing, and rework risk. Prefer the fewest cohesive features that each remain independently implementable and testable in one cycle.`,
      `- A feature is a cohesive, independently testable functional module. Think in user-facing flows, avoid technical layers.`,
      `- Group related work into ONE feature: all CRUD operations on the same entity, all endpoints of the same domain, tests with their implementation.`,
      `- NEVER create: single-endpoint features, single-file features, configuration-only features (e.g. "add CORS"), or features that separate tests from implementation.`,
      ``,
      `## Sizing examples`,
      `BAD (over-granulated, 7 features):`,
      `F001 Create User endpoint | F002 Get User endpoint | F003 Update User endpoint | F004 User input validation | F005 Setup database connection | F006 Add authentication middleware | F007 Write user tests`,
      ``,
      `GOOD (well-sized, 3 features):`,
      `F001 User Management — full CRUD (create, read, update, delete) with input validation | F002 Authentication & Authorization — login, session, middleware, role-based access | F003 Database & Infrastructure — connection setup, migrations, seeding`
    ]

    const orientationSection = buildDocsOrientationSection(context.config.projectPaths, context.workingDir)

    promptLines.push(
      ``,
      `<context>`,
      `Project paths: ${context.config.projectPaths.join(', ')}`,
      `</context>`,
      ``,
      ...orientationSection,
      `<scope>`,
      `\`\`\`markdown`,
      context.config.scope.trim(),
      `\`\`\``,
      `</scope>`
    )

    if (rulesList.length > 0) {
      promptLines.push(
        ``,
        `# STEERING RULES`,
        ...rulesList.map(r => `- ${r}`)
      )
    }
    const prompt = promptLines.join('\n')

    await context.invokeAgent({
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'bootstrap',
    })

    const created = context.fsm.loadBacklog()
    PhaseDecisionLogger.logBootstrap(context.fsm, created)

    return shouldRefine ? Phase.REFINEMENT : Phase.PLANNING
  }
}
