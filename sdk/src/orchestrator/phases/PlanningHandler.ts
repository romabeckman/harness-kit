import { Complexity, Phase } from "../types";
import { AbstractPhaseHandler, Reviewontext } from "./AbstractPhaseHandler";
import { ContextAssembler } from "../../context-assembler/ContextAssembler";
import type { Feature, Task } from "../../file-state/types";
import type { PlanningPayload } from "../../context-assembler/types";
import { join } from "node:path";
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import {
  buildDocsOrientationSection,
  formatRulesSection,
  formatProjectPathsList,
  buildComplexityRules,
  formatFeatureDependencies,
  inlineOrReference,
} from '../utils/PromptHelpers'
import { getPlanningSource, getSpecsDir } from '../utils/PhaseFileUtils'

export class PlanningHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.PLANNING) {
      return super.handle(phase, context);
    }

    if (context.config.enableRefinement && !context.fsm.existRefinement()) {
      return Phase.REFINEMENT;
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
    context.fsm.updateFeatureStatus(feature.id, "IN_PROGRESS");
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
      ? this.buildFeatureScopeRefinementPrompt(payload, feature, context)
      : this.buildScopeRefinementPrompt(payload, feature, context);

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

  buildScopeRefinementPrompt(payload: PlanningPayload, feature: Feature, context: Reviewontext): string {
    const projectPathsList = formatProjectPathsList(payload.projectPaths)
    const rulesSection = formatRulesSection(payload.steeringRules)

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

    const planningSource = getPlanningSource(context)

    const orientationSection = buildDocsOrientationSection(payload.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

    return [
      `## Objective`,
      `Perform scope refinement STRICTLY for the <target_feature>. Use the <scope> ONLY for system alignment and contextual awareness. Do NOT refine or generate specifications for the entire background context.`,
      ``,
      `<skill_context>`,
      `Invoke the \`harness-kit:scope-refinement\` skill before starting.`,
      `Mode: autonomous`,
      `</skill_context>`,
      ``,
      `<react_workflow>`,
      `- THOUGHT: Analyze feature scope and architectural constraints.`,
      `- ACTION: Draft tactical design and test scenarios.`,
      `- OBSERVATION: Verify if specs strictly cover the target feature.`,
      `</react_workflow>`,
      ``,
      `<workflow>`,
      `- Before writing any specification, run autonomous refinement: generate decision-changing questions and use each evidence-based recommendation as its answer.`,
      `- Route every refinement question and answer to each applicable \`003-\${PROJECT_NAME}-tactical-design.md\`; use exact project names and include global decisions in every project.`,
      `- Execute only the document phases required by <expected_outputs>; do not create artifacts that are not listed there.`,
      `- When the selected planning source is REFINEMENT.md, map the target feature to its PBI, functionality, persona, and underlying need.`,
      `- Treat human-validated decisions as authoritative and model answers as provisional assumptions.`,
      `</workflow>`,
      ``,
      ...complexityPrompt.expectedOutputs,
      ``,
      `<strict_rules>`,
      `- CRITICAL: Confine all refinement, tasks, and scenarios exclusively to the <target_feature>. Ignore other features present in the <scope>.`,
      `- DEPENDENCY RULE: If the <target_feature> has dependencies, acknowledge them as assumptions or interfaces in your design, but DO NOT design, spec, or generate tasks for the dependencies themselves.`,
      `- PROJECT NAME RULE: For phases 3 and 4, generate one tactical design and test scenarios file for each project listed in <project_paths>, replacing \${PROJECT_NAME} with the corresponding project name linked to that project path.`,
      ...complexityPrompt.strictRules,
      `- Execute autonomously without pausing or asking for confirmation.`,
      `- Write every file to disk before advancing to the next.`,
      `</strict_rules>`,
      ``,
      `<inputs>`,
      ``,
      ...orientationSection,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      ...inlineOrReference(
        'scope',
        payload.scope.trim(),
        planningSource.path,
        'markdown',
        'always',
        context.config.agentRunner,
      ),
      ``,
      `<target_feature>`,
      `ID: ${feature.id}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `Priority: ${feature.priority || 'No priority set'}`,
      `Dependencies: ${dependenciesText}`,
      `</target_feature>`,
      ``,
      `</inputs>`,
    ].join("\n");
  }

  buildFeatureScopeRefinementPrompt(payload: PlanningPayload, feature: Feature, context: Reviewontext): string {
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
    const rulesSection = formatRulesSection(payload.steeringRules)
    const projectPathsList = formatProjectPathsList(payload.projectPaths)
    const planningSource = getPlanningSource(context)

    return [
      `## Objective`,
      `Perform scope refinement STRICTLY for the <target_feature>. Use previous context and architectural decisions for system alignment. Do NOT refine or generate specifications for the entire background context.`,
      ``,
      `<skill_context>`,
      `Invoke the \`harness-kit:scope-refinement\` skill before starting.`,
      `Mode: autonomous`,
      `</skill_context>`,
      ``,
      `<react_workflow>`,
      `- THOUGHT: Analyze feature scope and architectural constraints.`,
      `- ACTION: Draft tactical design and test scenarios.`,
      `- OBSERVATION: Verify if specs strictly cover the target feature.`,
      `</react_workflow>`,
      ``,
      `<workflow>`,
      `- Before writing any specification, run autonomous refinement: generate decision-changing questions and use each evidence-based recommendation as its answer.`,
      `- Route every refinement question and answer to each applicable \`003-\${PROJECT_NAME}-tactical-design.md\`; use exact project names and include global decisions in every project.`,
      `- Execute only the document phases required by <expected_outputs>; do not create artifacts that are not listed there.`,
      `</workflow>`,
      ``,
      ...complexityPrompt.expectedOutputs,
      ``,
      `<strict_rules>`,
      `- CRITICAL: Confine all refinement, tasks, and scenarios exclusively to the <target_feature>. Ignore other features present in the scope.`,
      `- DEPENDENCY RULE: If the <target_feature> has dependencies, acknowledge them as assumptions or interfaces in your design, but DO NOT design, spec, or generate tasks for the dependencies themselves.`,
      `- PROJECT NAME RULE: For phases 3 and 4, generate one tactical design and test scenarios file for each project listed in <project_paths>, replacing \${PROJECT_NAME} with the corresponding project name linked to that project path.`,
      ...complexityPrompt.strictRules,
      `- Execute autonomously without pausing or asking for confirmation.`,
      `- Write every file to disk before advancing to the next.`,
      `</strict_rules>`,
      ``,
      `<inputs>`,
      `<context_anchors>`,
      `Feature: ${feature.id} — ${payload.featureTitle}`,
      `${planningSource.label}: ${planningSource.path}`,
      `Specifications: ${payload.workingDir}`,
      `Projects:`,
      projectPathsList,
      `</context_anchors>`,
      ...(planningSource.isRefinement ? [
        ``,
        `<refinement_rules>`,
        `Read the PBB refinement anchor before designing the target feature.`,
        `Map the feature to its PBI, functionality, persona, and underlying need.`,
        `Human-validated decisions are authoritative; model answers remain provisional assumptions.`,
        `</refinement_rules>`,
      ] : []),
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<target_feature>`,
      `ID: ${feature.id}`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `Priority: ${feature.priority || 'No priority set'}`,
      `Dependencies: ${dependenciesText}`,
      `</target_feature>`,
      ``,
      `</inputs>`,
    ].join("\n");
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
      prompt: [
        `## Objective`,
        `Extract ordered development tasks from the tactical design and append them to DEVELOPMENT-STATE.md.`,
        ``,
        ...orientationSection,
        `<project_paths>`,
        projectPathsList,
        `</project_paths>`,
        ``,
        `Read all files matching \`${tacticalDesignFile}\`.`,
        `Locate the fenced JSON array containing task objects with "title" and "id" fields.`,
        `For each task object, append a row to docs/product/DEVELOPMENT-STATE.md using this format:`,
        `| ${feature.id} | T<zero-padded id> | <project path> | <title> | ${feature.domain} | - | NOT_STARTED |`,
        `where <project path> is the project name corresponding to the project in \`project_paths\`.`,
        `Do not output anything else.`,
      ].join("\n"),
    });
  }
}
