import { Complexity, Phase } from "../types";
import { AbstractPhaseHandler, Reviewontext } from "./AbstractPhaseHandler";
import { ContextAssembler } from "../../context-assembler/ContextAssembler";
import type { Feature } from "../../file-state/types";
import type { PlanningPayload } from "../../context-assembler/types";
import { join } from "node:path";
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import {
  buildDocsOrientationSection,
  formatRulesSection,
  formatProjectPathsList,
  buildComplexityRules,
  formatFeatureDependencies,
} from '../utils/PromptHelpers'
import { getSpecsDir } from '../utils/PhaseFileUtils'

const INLINE_THRESHOLD = 5000

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

    if (!context.checkSpecFilesPresent(activeFeature.domain)) {
      await this.runScopeRefinement(activeFeature, context);
    }

    await this.ensureTasksAppended(activeFeature, context, phase);

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

    if (!context.fsm.existScope()) {
      throw new Error('Scope file (SCOPE.md) does not exist')
    }

    const scope = context.fsm.loadScope()
    if (!scope) {
      throw new Error('Scope file (SCOPE.md) is empty')
    }
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

    const backlog = context.fsm.loadBacklog();
    const dependenciesText = formatFeatureDependencies(backlog, feature)

    const refinementBlock = context.fsm.existRefinement?.()
      ? [
        ``,
        `<refinement_context>`,
        `The following refinement document was produced from a human-validated questionnaire.`,
        `Use it as authoritative context for architectural decisions, constraints, and design guidelines.`,
        ``,
        `\`\`\`markdown`,
        context.fsm.loadRefinement().trim(),
        `\`\`\``,
        `</refinement_context>`,
      ]
      : []

    const orientationSection = buildDocsOrientationSection(payload.projectPaths, context.workingDir)

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
      `- Run all four autonomous phases of \`harness-kit:scope-refinement\` in order.`,
      `- When <refinement_context> is present, treat its human-validated decisions as authoritative.`,
      `</workflow>`,
      ``,
      `<expected_outputs>`,
      `Produce, under \`${payload.workingDir}\` (one file per project in <project_paths> for phases 3 and 4, where \${PROJECT_NAME} is the project name linked to each project in <project_paths>):`,
      `- \`${problemSpaceFile}\`   Strategic Design: Domain Events, Subdomains, Ubiquitous Language, Socratic Questions (Focused ONLY on the target feature; maximum ${INLINE_THRESHOLD} characters)`,
      `- \`${contextMapFile}\`   Bounded Contexts and Context Map (maximum ${INLINE_THRESHOLD} characters)`,
      `- \`${tacticalDesignFile}\` (one per project in <project_paths>) — Tactical Design; must include \`## Section 6 — Ordered Development Tasks\` with a fenced JSON array of objects`,
      `- \`${testScenariosFile}\` (one per project in <project_paths>)   Test Scenarios`,
      `</expected_outputs>`,
      ``,
      `<strict_rules>`,
      `- CRITICAL: Confine all refinement, tasks, and scenarios exclusively to the <target_feature>. Ignore other features present in the <scope>.`,
      `- DEPENDENCY RULE: If the <target_feature> has dependencies, acknowledge them as assumptions or interfaces in your design, but DO NOT design, spec, or generate tasks for the dependencies themselves.`,
      `- PROJECT NAME RULE: For phases 3 and 4, generate one tactical design and test scenarios file for each project listed in <project_paths>, replacing \${PROJECT_NAME} with the corresponding project name linked to that project path.`,
      ...buildComplexityRules(complexity),
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
      `<scope>`,
      `\`\`\`markdown`,
      payload.scope.trim(),
      `\`\`\``,
      `</scope>`,
      ...refinementBlock,
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

    const backlog = context.fsm.loadBacklog();
    const dependenciesText = formatFeatureDependencies(backlog, feature)
    const rulesSection = formatRulesSection(payload.steeringRules)
    const projectPathsList = formatProjectPathsList(payload.projectPaths)

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
      `- Run all four autonomous phases of \`harness-kit:scope-refinement\` in order.`,
      `</workflow>`,
      ``,
      `<expected_outputs>`,
      `Produce, under \`${payload.workingDir}\` (one file per project in <project_paths> for phases 3 and 4, where \${PROJECT_NAME} is the project name linked to each project in <project_paths>):`,
      `- \`${problemSpaceFile}\`   Strategic Design: Domain Events, Subdomains, Ubiquitous Language, Socratic Questions (Focused ONLY on the target feature; maximum ${INLINE_THRESHOLD} characters)`,
      `- \`${contextMapFile}\`   Bounded Contexts and Context Map (maximum ${INLINE_THRESHOLD} characters)`,
      `- \`${tacticalDesignFile}\` (one per project in <project_paths>) — Tactical Design; must include \`## Section 6 — Ordered Development Tasks\` with a fenced JSON array of objects`,
      `- \`${testScenariosFile}\` (one per project in <project_paths>)   Test Scenarios`,
      `</expected_outputs>`,
      ``,
      `<strict_rules>`,
      `- CRITICAL: Confine all refinement, tasks, and scenarios exclusively to the <target_feature>. Ignore other features present in the scope.`,
      `- DEPENDENCY RULE: If the <target_feature> has dependencies, acknowledge them as assumptions or interfaces in your design, but DO NOT design, spec, or generate tasks for the dependencies themselves.`,
      `- PROJECT NAME RULE: For phases 3 and 4, generate one tactical design and test scenarios file for each project listed in <project_paths>, replacing \${PROJECT_NAME} with the corresponding project name linked to that project path.`,
      ...buildComplexityRules(complexity),
      `- Execute autonomously without pausing or asking for confirmation.`,
      `- Write every file to disk before advancing to the next.`,
      `</strict_rules>`,
      ``,
      `<inputs>`,
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
    phase: Phase
  ): Promise<void> {
    const existing = context.fsm
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
    const orientationSection = buildDocsOrientationSection(context.config.projectPaths, context.workingDir)

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
