import { loadPrompt } from '../utils/PromptTemplate'
import { Complexity, Phase } from "../types";
import { AbstractPhaseHandler, Reviewontext } from "./AbstractPhaseHandler";
import { ContextAssembler } from "../../context-assembler/ContextAssembler";
import type { Feature, Task } from "../../file-state/types";
import type { PlanningPayload } from "../../context-assembler/types";
import { dirname, join, relative } from "node:path";
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import {
  buildDocsOrientationSection,
  formatRulesSection,
  formatProjectPathsList,
  buildComplexityRules,
  formatFeatureDependencies,
  inlineOrReference,
} from '../utils/PromptHelpers'
import { getPlanningSource, getSpecsDir, type PlanningSource } from '../utils/PhaseFileUtils'

export class PlanningHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.PLANNING) {
      return super.handle(phase, context);
    }

    const features = context.fsm.loadBacklog();
    const activeFeature = context.getActiveFeature(features);

    if (!activeFeature) {
      console.error(
        "\n✗ Error: No active feature found in backlog to process.",
      );
      return Phase.HALTED;
    }

    const config = context.fsm.loadBootstrapConfig();
    config.activeFeatureId = activeFeature.id
    context.fsm.saveBootstrapConfig(config)

    if (this.hasCascadeBlock(activeFeature, features))
      return Phase.CASCADE_BLOCKED;

    if (activeFeature.status !== 'IN_PROGRESS') {
      context.fsm.updateFeatureStatus(activeFeature.id, 'IN_PROGRESS');
    }

    const existingFeatureTasks = context.fsm.loadDevelopmentState()
      .filter(t => t.featureId === activeFeature.id)

    // Domain-level artifacts may belong to a previous feature. Require task
    // provenance for this feature before allowing planning to be skipped.
    if (!context.checkSpecFilesPresent(activeFeature.domain) || existingFeatureTasks.length === 0) {
      await this.runScopeRefinement(activeFeature, context);
    }

    await this.ensureTasksAppended(
      activeFeature,
      context,
      phase,
      existingFeatureTasks.length > 0 ? existingFeatureTasks : undefined,
    );

    const specsDir = getSpecsDir(context.workingDir, activeFeature.domain)
    const taskCount = context.fsm.loadDevelopmentState()
      .filter(t => t.featureId === activeFeature.id).length
    PhaseDecisionLogger.logPlanning(context.fsm, activeFeature, specsDir, taskCount)

    return Phase.DEVELOPMENT;
  }

  private hasCascadeBlock(feature: Feature, allFeatures: Feature[]): boolean {
    return feature.dependencies.some((depId) => {
      const dep = allFeatures.find((f) => f.id === depId);
      return dep?.status === "BLOCKED";
    });
  }

  private async runScopeRefinement(
    feature: Feature,
    context: Reviewontext,
  ): Promise<void> {
    const config = context.fsm.loadBootstrapConfig();
    const workingDir = getSpecsDir(context.workingDir, feature.domain)

    const planningSource = getPlanningSource(context)
    if (!planningSource.exists) {
      throw new Error(`${planningSource.label} file (${planningSource.fileName}) does not exist`)
    }

    if (!planningSource.content) {
      throw new Error(`${planningSource.label} file (${planningSource.fileName}) is empty`)
    }
    const scope = planningSource.content
    context.config.scope = scope

    const payload = ContextAssembler.buildPlanningPayload(
      feature,
      workingDir,
      context.config.projectPaths,
      context.config.scope,
      config.steeringRules,
    );

    const agent = 'harness-kit:software-architect'
    const developerSession = context.getDeveloperSession?.(agent, undefined, Phase.PLANNING)

    const prompt = developerSession
      ? this.buildFeatureScopeRefinementPrompt(payload, feature, context, planningSource)
      : this.buildScopeRefinementPrompt(payload, feature, context, planningSource);

    const output = await context.invokeAgent({
      skill: "harness-kit:scope-refinement",
      agent,
      mode: "autonomous",
      prompt,
      phaseKey: "planning",
      domain: feature.domain,
      ...(developerSession ? { session: developerSession } : {}),
    });

    if (output?.session) {
      context.setDeveloperSession?.({
        featureId: "",
        agent,
        session: output.session,
        phase: Phase.PLANNING,
      });
    }
  }

  buildScopeRefinementPrompt(
    payload: PlanningPayload,
    feature: Feature,
    context: Reviewontext,
    planningSource = getPlanningSource(context),
  ): string {
    return this.buildPlanningPrompt(payload, feature, context, planningSource)
  }

  buildFeatureScopeRefinementPrompt(
    payload: PlanningPayload,
    feature: Feature,
    context: Reviewontext,
    planningSource = getPlanningSource(context),
  ): string {
    const contextAnchors = loadPrompt('planning/continuation', {
      id: feature.id,
      featureTitle: payload.featureTitle,
      workingDir: payload.workingDir,
    }).split('\n')
    return this.buildPlanningPrompt(payload, feature, context, planningSource, contextAnchors)
  }

  private buildPlanningPrompt(
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

  buildFeaturePrompt(payload: PlanningPayload, feature: Feature, context: Reviewontext): string {
    return this.buildFeatureScopeRefinementPrompt(payload, feature, context);
  }

  private async ensureTasksAppended(
    feature: Feature,
    context: Reviewontext,
    phase: Phase,
    initialTasks?: Task[],
  ): Promise<void> {
    const existing = initialTasks ?? context.fsm
      .loadDevelopmentState()
      .filter((t) => t.featureId === feature.id);

    if (existing.length > 0) return;

    let extracted = context.extractTasksFromTacticalDesign(feature.domain);

    if (extracted.length === 0) {
      await this.recoverTasksViaAgent(feature, context);

      const recovered = context.fsm
        .loadDevelopmentState()
        .filter((t) => t.featureId === feature.id);

      if (recovered.length === 0) {
        throw new Error(
          `${phase} failed: no tasks extracted for feature ${feature.id} (domain '${feature.domain}'). ` +
          `Verify that docs/specs/${feature.domain}/003-*-tactical-design.md contains a valid JSON array with objects having 'title'.`,
        );
      }
      return;
    }

    context.fsm.appendTasks(
      extracted.map((t) => ({
        featureId: feature.id,
        taskId: t.taskId,
        project: t.file || "-",
        description: t.description,
        domain: feature.domain,
        currentPhase: "-" as const,
        status: "NOT_STARTED" as const,
      })),
    );
  }

  private async recoverTasksViaAgent(
    feature: Feature,
    context: Reviewontext,
  ): Promise<void> {
    const projectPathsList = formatProjectPathsList(context.config.projectPaths)
    const tacticalDesignFile = join(context.workingDir, 'docs', 'specs', feature.domain, `003-*-tactical-design.md`)
    const orientationSection = buildDocsOrientationSection(context.config.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

    await context.invokeAgent({
      agent: "harness-kit:software-architect",
      mode: "autonomous",
      phaseKey: "planning",
      domain: feature.domain,
      prompt: loadPrompt('planning/recover-tasks', {
      orientationSection: orientationSection,
      projectPathsList: projectPathsList,
      tacticalDesignFile: tacticalDesignFile,
      id: feature.id,
      domain: feature.domain,
    }),
    });
  }
}
