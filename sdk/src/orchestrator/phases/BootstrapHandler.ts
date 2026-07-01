import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'

export class BootstrapHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.BOOTSTRAP) {
      return super.handle(phase, context)
    }

    context.fsm.ensureProductFiles(context.config)

    const bootConfig = context.fsm.loadBootstrapConfig()
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
      `You are the autonomous orchestrator bootstrap agent.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/autonomous-orchestrator:bootstrap\` skill before starting.`,
      `You are operating as the \`software-architect\` agent.`,
      `</skill_context>`,
      ``,
      `# OBJECTIVE`,
      `Parse the project scope below and generate a \`BACKLOG.md\` table. Write it to: \`${backlogPath}\``,
      ``,
      `# OUTPUT FORMAT`,
      `Table columns (exact):`,
      `| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |`,
      ``,
      `# CONSTRAINTS & RULES`,
      `- **ID**: F001, F002, ... (sequential, bolded: **F001**)`,
      `- **Title**: Bolded: **Feature Name**`,
      `- **Domain**: snake_case of feature title`,
      `- **Priority**: CRITICAL, HIGH, MEDIUM, or LOW`,
      `- **Dependencies**: comma-separated IDs, or None`,
      `- **Reworks**: 0`,
      `- **Score (TL)** & **Score (Adv)**: -`,
      `- **Status**: NOT_STARTED`,
      `- Each row must represent exactly one deliverable feature.`,
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
      skill: 'autonomous-orchestrator:bootstrap',
      agent: 'software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'bootstrap',
    })

    return Phase.PHASE_A
  }
}
