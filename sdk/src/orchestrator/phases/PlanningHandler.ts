import { Complexity, Phase } from "../types";
import { AbstractPhaseHandler, Reviewontext } from "./AbstractPhaseHandler";
import { ContextAssembler } from "../../context-assembler/ContextAssembler";
import type { Feature } from "../../file-state/types";
import type { PlanningPayload } from "../../context-assembler/types";
import { join } from "node:path";
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import { buildDocsOrientationSection } from '../utils/PromptHelpers'

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

    const specsDir = join(context.workingDir, 'docs', 'specs', activeFeature.domain)
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
    const workingDir = join(context.workingDir, 'docs', 'specs', feature.domain)

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

    const prompt = this.buildScopeRefinementPrompt(payload, feature, context);

    await context.invokeAgent({
      skill: "harness-kit:scope-refinement",
      agent: "harness-kit:software-architect",
      mode: "autonomous",
      prompt,
      phaseKey: "planning",
      domain: feature.domain,
    });
  }

  private buildScopeRefinementPrompt(payload: PlanningPayload, feature: Feature, context: Reviewontext): string {
    const projectPathsList = payload.projectPaths
      .map((p) => `- ${p}`)
      .join("\n");
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
        ? payload.steeringRules.map((r) => `- ${r}`).join("\n")
        : "- No additional rules provided";

    const complexity = context.config.complexity ?? Complexity.AUTO
    const problemSpaceFile = join(payload.workingDir, '001-problem-space.md');
    const contextMapFile = join(payload.workingDir, '002-context-map.md');
    const tacticalDesignFile = join(payload.workingDir, `003-\${PROJECT_NAME}-tactical-design.md`);
    const testScenariosFile = join(payload.workingDir, `004-\${PROJECT_NAME}-test-scenarios.md`);

    const backlog = context.fsm.loadBacklog();
    const dependenciesText = backlog
      .filter((f) => feature.dependencies.includes(f.id))
      .map((f) => `\`${join('docs', 'specs', f.domain)}\``)
      .join(", ") || 'None';

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
      `Produce, under \`${payload.workingDir}\` (one file per project for phases 3 and 4, where \${PROJECT_NAME} = root folder name of each project path):`,
      `- \`${problemSpaceFile}\`   Strategic Design: Domain Events, Subdomains, Ubiquitous Language, Socratic Questions (Focused ONLY on the target feature; maximum ${INLINE_THRESHOLD} characters)`,
      `- \`${contextMapFile}\`   Bounded Contexts and Context Map (maximum ${INLINE_THRESHOLD} characters)`,
      `- \`${tacticalDesignFile}\` (one per project) — Tactical Design; must include \`## Section 6 — Ordered Development Tasks\` with a fenced JSON array of objects`,
      `- \`${testScenariosFile}\` (one per project)   Test Scenarios`,
      `</expected_outputs>`,
      ``,
      `<strict_rules>`,
      `- CRITICAL: Confine all refinement, tasks, and scenarios exclusively to the <target_feature>. Ignore other features present in the <scope>.`,
      `- DEPENDENCY RULE: If the <target_feature> has dependencies, acknowledge them as assumptions or interfaces in your design, but DO NOT design, spec, or generate tasks for the dependencies themselves.`,
      ...(complexity !== Complexity.AUTO
        ? (
          complexity === Complexity.LOW ?
            [
              `- COMPLEXITY OVERRIDE: Classify as 'LOW' — do not re-evaluate scope complexity.`,
              `- For 'LOW': Keep analysis concise and reuse established patterns, but still produce all required 001–004 artifacts.`,
            ] :
            [
              `- COMPLEXITY OVERRIDE: Classify as 'HIGH' — do not re-evaluate scope complexity.`,
              `- For 'HIGH': Give additional depth to integrations, failure modes, security boundaries, concurrency, and compatibility risks while producing all required 001–004 artifacts.`,
            ]
        ) : [
          `- Evaluate scope complexity between 'LOW' and 'HIGH'. LOW is characterized by crystal-clear requirements, zero structural ambiguities, isolated changes, zero cross-team dependencies, use of existing patterns, straightforward flows, zero backward compatibility risks, and standard unit testing without complex integrations.`,
          `- If LOW: keep analysis concise and reuse established patterns. If HIGH: deepen analysis of integrations, failure modes, security boundaries, concurrency, and compatibility risks. In both cases, produce all required 001–004 artifacts.`,
        ]),
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
    const projectPathsList = context.config.projectPaths
      .map((p) => `- ${p}`)
      .join("\n");
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
        `where <project> is one of the last folder segment of the project path: \`project_paths\`.`,
        `Do not output anything else.`,
      ].join("\n"),
    });
  }
}
