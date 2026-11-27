import { loadPrompt } from '../utils/PromptTemplate'
import { Phase } from '../types'
import { AbstractPhaseHandler, type Reviewontext } from './AbstractPhaseHandler'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import type { Feature } from '../../file-state/types'
import type { PlanningPayload } from '../../context-assembler/types'
import { join } from 'node:path'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import { PlanningPromptService } from '../services/PlanningPromptService'
import { buildDocsOrientationSection, formatProjectPathsList } from '../utils/PromptHelpers'
import { getPlanningSource, getSpecsDir } from '../utils/PhaseFileUtils'

export class PlanningHandler extends AbstractPhaseHandler {
  private readonly prompts = new PlanningPromptService()

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

    const plannedTasks = existingFeatureTasks.length > 0 ? existingFeatureTasks : context.fsm.loadDevelopmentState()
      .filter(task => task.featureId === activeFeature.id)
    if (plannedTasks.length === 0 && !this.appendExtractedTasks(activeFeature, context)) {
      await this.recoverTasksViaAgent(activeFeature, context)

      const recovered = context.fsm.loadDevelopmentState()
        .some(task => task.featureId === activeFeature.id)
      if (!recovered) {
        throw new Error(
          `${phase} failed: no tasks extracted for feature ${activeFeature.id} (domain '${activeFeature.domain}'). ` +
          `Verify that docs/specs/${activeFeature.domain}/003-*-tactical-design.md contains a valid JSON array with objects having 'title'.`,
        )
      }
    }

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
    return this.prompts.buildPlanningPrompt(payload, feature, context, planningSource)
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
    return this.prompts.buildPlanningPrompt(payload, feature, context, planningSource, contextAnchors)
  }

  buildFeaturePrompt(payload: PlanningPayload, feature: Feature, context: Reviewontext): string {
    return this.buildFeatureScopeRefinementPrompt(payload, feature, context);
  }

  private appendExtractedTasks(feature: Feature, context: Reviewontext): boolean {
    const extracted = context.extractTasksFromTacticalDesign(feature.domain)
    if (extracted.length === 0) return false

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
    )
    return true
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
