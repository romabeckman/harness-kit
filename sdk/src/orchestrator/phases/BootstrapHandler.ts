import { join } from 'node:path'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'

export class BootstrapHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.BOOTSTRAP) {
      return super.handle(phase, context)
    }

    context.fsm.ensureProductFiles()

    const existing = context.fsm.loadBacklog()
    if (existing.length > 0) return Phase.PHASE_A

    const productDir = context.config.productDir ?? join(context.workingDir, 'docs', 'product')
    const backlogPath = join(productDir, 'BACKLOG.md')

    const prompt = [
      `You are the autonomous orchestrator bootstrap agent.`,
      ``,
      `Parse the project scope below and generate a BACKLOG.md table. Write it to: ${backlogPath}`,
      ``,
      `Table columns (exact):`,
      `| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |`,
      ``,
      `Rules:`,
      `- ID: F001, F002, ... (sequential)`,
      `- Domain: snake_case of feature title`,
      `- Priority: CRITICAL, HIGH, MEDIUM, or LOW`,
      `- Dependencies: comma-separated IDs, or None`,
      `- Reworks: 0`,
      `- Score (TL) and Score (Adv): -`,
      `- Status: NOT_STARTED`,
      `- Each row is one deliverable feature`,
      `- Bold ID and Title: **F001** and **Feature Name**`,
      ``,
      `Project paths: ${context.config.projectPaths.join(', ')}`,
      ``,
      `## Scope`,
      ``,
      context.config.scope,
    ].join('\n')

    await context.invokeAgent({
      skill: 'autonomous-orchestrator:bootstrap',
      agent: 'software-architect',
      mode: 'autonomous',
      payload: {},
      prompt,
      phaseKey: 'bootstrap',
    })

    return Phase.PHASE_A
  }
}
