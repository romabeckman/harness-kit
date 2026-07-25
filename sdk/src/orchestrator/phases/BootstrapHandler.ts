import { join } from 'node:path'
import { Phase, CliCommand } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'

export class BootstrapHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
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

    if (existing.length > 0) return Phase.PHASE_A

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
      `# CONSTRAINTS & RULES`,
      `- ID: F001, F002, ... (sequential: F001, F002, F003, ...). Do not skip numbers.`,
      `- Title: Feature Name with short description with objective, limit of 500 characters.`,
      `- Domain: snake_case of feature title without spaces, limit of 50 characters.`,
      `- Agent: Only names: \`backend\`, \`frontend\`, \`qa\` or \`devops\` — infer from the feature scope; use the project paths as hints`,
      `- Priority: CRITICAL, HIGH, MEDIUM, or LOW. Only use CRITICAL if the feature is mission critical, if it impacts the core functionality of the system, or if it is a security requirement.`,
      `- Dependencies: comma-separated IDs, or None`,
      `- Reworks: 0`,
      `- Score (TL) & Score (Adv): -`,
      `- Status: NOT_STARTED`,
      `- Each row must represent exactly one deliverable feature.`,
      `- Never add additional text outside the markdown table, only include the table.`
    ]

    if (rulesList.length > 0) {
      promptLines.push(
        ``,
        `# STEERING RULES`,
        ...rulesList.map(r => `- ${r}`)
      )
    }

    promptLines.push(
      ``,
      `<context>`,
      `Project paths: ${context.config.projectPaths.join(', ')}`,
      `</context>`,
      ``,
      `<scope>`,
      context.config.scope,
      `</scope>`
    )
    const prompt = promptLines.join('\n')

    await context.invokeAgent({
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'bootstrap',
    })

    const created = context.fsm.loadBacklog()
    PhaseDecisionLogger.logBootstrap(context.fsm, created)

    return Phase.PHASE_A
  }
}
