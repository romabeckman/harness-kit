import { loadPrompt } from '../utils/PromptTemplate'
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
import { getPlanningSource, getProductDir } from '../utils/PhaseFileUtils'

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

    const planningSource = getPlanningSource(context)
    if (planningSource.exists) {
      context.config.scope = planningSource.content
    }

    const config = context.fsm.loadBootstrapConfig();
    const recentDecisions = context.fsm.loadRecentDecisions(20)
    const payload = ContextAssembler.buildMemoryPayload(
      context.config.projectPaths,
      context.workingDir,
      config.steeringRules,
      recentDecisions,
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
    const decisionsFile = join(getProductDir(context), 'DECISIONS.md')
    const tlPattern = join(context.workingDir, 'docs', 'specs', '[domain]', 'TL.json')
    const qaPattern = join(context.workingDir, 'docs', 'specs', '[domain]', 'QA.json')
    const reworkPattern = join(context.workingDir, 'docs', 'specs', '[domain]', 'REWORK-LOG.md')
    const projectPathsList = formatProjectPathsList(payload.projectPaths)
    const rulesSection = formatRulesSection(payload.steeringRules)

    const orientationSection = buildDocsOrientationSection(payload.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

    // Static-first ordering: everything that doesn't change between invocations
    // goes before the variable blocks (scope, project_paths, rules), so those
    // can share a single cached prefix across calls (cacheReadTokens instead
    // of cacheCreationTokens on repeat invocations within the same run).
    return loadPrompt('memory/project-memory', {
      backlogFile: backlogFile,
      specsPattern: specsPattern,
      specsPattern2: specsPattern,
      decisionsFile: decisionsFile,
      tlPattern: tlPattern,
      qaPattern: qaPattern,
      reworkPattern: reworkPattern,
      lengthSection: payload.recentDecisions?.length ? payload.recentDecisions : ['No recent decisions recorded.'],
      orientationSection: orientationSection,
      scope: context.config.scope.trim(),
      projectPathsList: projectPathsList,
      rulesSection: rulesSection,
    })
  }
}
