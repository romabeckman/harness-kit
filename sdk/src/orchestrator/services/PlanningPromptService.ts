import { dirname, join, relative } from 'node:path'
import type { PlanningPayload } from '../../context-assembler/types'
import type { Feature } from '../../file-state/types'
import type { Reviewontext } from '../phases/AbstractPhaseHandler'
import { Complexity } from '../types'
import type { PlanningSource } from '../utils/PhaseFileUtils'
import {
  buildComplexityRules,
  buildDocsOrientationSection,
  formatFeatureDependencies,
  formatProjectPathsList,
  formatRulesSection,
  inlineOrReference,
} from '../utils/PromptHelpers'
import { loadPrompt } from '../utils/PromptTemplate'

export class PlanningPromptService {
  buildPlanningPrompt(
    payload: PlanningPayload,
    feature: Feature,
    context: Reviewontext,
    planningSource: PlanningSource,
    contextAnchors: string[] = [],
  ): string {
    const complexity = context.config.complexity ?? Complexity.AUTO
    const problemSpaceFile = join(payload.workingDir, '001-problem-space.md');
    const contextMapFile = join(payload.workingDir, '002-context-map.md');
    const tacticalDesignFile = join(payload.workingDir, `003-\${PROJECT_NAME}-tactical-design.md`);
    const testScenariosFile = join(payload.workingDir, `004-\${PROJECT_NAME}-test-scenarios.md`);
    const complexityPrompt = buildComplexityRules(complexity, {
      outputDirectory: payload.workingDir,
      problemSpaceFile,
      contextMapFile,
      tacticalDesignFile,
      testScenariosFile,
    })

    const backlog = context.fsm.loadBacklog();
    const dependenciesText = formatFeatureDependencies(backlog, feature)

    const scopeDirectory = relative(context.workingDir, dirname(planningSource.path))
    const scopeFilePath = join(scopeDirectory, planningSource.fileName)
    const orientationSection = contextAnchors.length > 0
      ? []
      : buildDocsOrientationSection(payload.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

    return loadPrompt('planning/scope', {
      expectedOutputs: complexityPrompt.expectedOutputs,
      strictRules: complexityPrompt.strictRules,
      orientationSection,
      contextAnchors,
      rulesSection: formatRulesSection(payload.steeringRules),
      projectPathsList: formatProjectPathsList(payload.projectPaths),
      refinementSection: planningSource.isRefinement
        ? loadPrompt('planning/refinement-rules', {}).split('\n')
        : [],
      setupDecisionsSection: this.buildSetupDecisionsSection(planningSource, context),
      scopeFilePath,
      scopeSection: inlineOrReference(
        'scope',
        payload.scope.trim(),
        planningSource.path,
        'markdown',
        'always',
        context.config.agentRunner,
      ),
      id: feature.id,
      featureTitle: payload.featureTitle,
      domain: payload.domain,
      priority: feature.priority || 'No priority set',
      dependenciesText: dependenciesText,
    });
  }

  private buildSetupDecisionsSection(source: PlanningSource, context: Reviewontext): string[] {
    if (!source.isRefinement) return []
    const decisions = context.fsm.loadSetupDecisions()
    return decisions.length ? ['<setup_decisions>', JSON.stringify(decisions, null, 2), '</setup_decisions>'] : []
  }
}
