import { Phase } from "../types";
import { AbstractPhaseHandler, ExtractedTask, PhaseContext } from "./AbstractPhaseHandler";
import { ContextAssembler } from "../../context-assembler/ContextAssembler";
import type { Feature } from "../../file-state/types";
import type { PhaseAPayload } from "../../context-assembler/types";
import { join } from "node:path";

export class PhaseAHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_A) {
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

    // If spec files are not present, run scope refinement to generate them.
    if (!context.checkSpecFilesPresent(activeFeature.domain)) {
      await this.runScopeRefinement(activeFeature, context);
    }

    await this.ensureTasksAppended(activeFeature, context);

    return Phase.PHASE_B;
  }

  // Returns true when any direct dependency is BLOCKED, triggering a cascade.
  private hasCascadeBlock(feature: Feature, allFeatures: Feature[]): boolean {
    return feature.dependencies.some((depId) => {
      const dep = allFeatures.find((f) => f.id === depId);
      return dep?.status === "BLOCKED";
    });
  }

  // Delegates scope-refinement to the software-architect agent and marks the feature IN_PROGRESS.
  private async runScopeRefinement(
    feature: Feature,
    context: PhaseContext,
  ): Promise<void> {
    context.fsm.updateFeatureStatus(feature.id, "IN_PROGRESS");

    const config = context.fsm.loadBootstrapConfig();
    const workingDir = join(context.workingDir, 'docs', 'specs', feature.domain)
    const payload = ContextAssembler.buildPhaseAPayload(
      feature,
      workingDir,
      context.config.projectPaths,
      context.config.scope,
      config.steeringRules,
    );

    const prompt = this.buildScopeRefinementPrompt(payload, context.config.complexity);

    await context.invokeAgent({
      skill: "scope-refinement",
      agent: "software-architect",
      mode: "autonomous",
      prompt,
      phaseKey: "phase_a",
    });
  }

  private buildScopeRefinementPrompt(payload: PhaseAPayload, complexity?: 'SIMPLE' | 'COMPLEX'): string {
    const projectPathsList = payload.projectPaths
      .map((p) => `- ${p}`)
      .join("\n");
    const rulesSection =
      payload.steeringRules && payload.steeringRules.length > 0
        ? payload.steeringRules.map((r) => `- ${r}`).join("\n")
        : "- No additional rules provided";

    const problemSpaceFile = join(payload.workingDir, '001-problem-space.md');
    const contextMapFile = join(payload.workingDir, '002-context-map.md');
    const tacticalDesignFile = join(payload.workingDir, `003-\${PROJECT_NAME}-tactical-design.md`);
    const testScenariosFile = join(payload.workingDir, `004-\${PROJECT_NAME}-test-scenarios.md`);

    return [
      `## Objective`,
      `Perform scope refinement STRICTLY for the <target_feature>. Use the <background_context> ONLY for system alignment and contextual awareness. Do NOT refine or generate specifications for the entire background context.`,
      ``,
      `<skill_context>`,
      `Invoke the \`/scope-refinement\` skill before starting.`,
      `You are operating as the \`software-architect\` agent.`,
      `</skill_context>`,
      ``,
      `<inputs>`,
      ``,
      ``,
      `<background_context>`,
      `\`\`\``,
      payload.scope.trim(),
      `\`\`\``,
      `</background_context>`,
      ``,
      ``,
      `<backlog_overview>`,
      `Read the backlog file at \`docs/product/BACKLOG.md\` (a Markdown table). Locate the exact row matching the <target_feature> Title and Domain.`,
      `Extract its ID, Priority, and Dependencies to inform your architecture. Do NOT process or extract data from any other rows.`,
      `</backlog_overview>`,
      ``,
      ``,
      `<target_feature>`,
      `Title: ${payload.featureTitle}`,
      `Domain: ${payload.domain}`,
      `</target_feature>`,
      ``,
      `<project_paths>`,
      projectPathsList,
      `</project_paths>`,
      ``,
      `<rules>`,
      rulesSection,
      `</rules>`,
      ``,
      `</inputs>`,
      ``,
      `<expected_outputs>`,
      `Produce, under \`${payload.workingDir}\` (one file per project for phases 3 and 4, where \${PROJECT_NAME} = root folder name of each project path):`,
      `- \`${problemSpaceFile}\` — Strategic Design: Domain Events, Subdomains, Ubiquitous Language, Socratic Questions (Focused ONLY on the target feature)`,
      `- \`${contextMapFile}\` — Bounded Contexts and Context Map`,
      `- \`${tacticalDesignFile}\` (one per project) — Tactical Design; must include \`## Section 6 — Ordered Development Tasks\` with a fenced JSON array objects`,
      `- \`${testScenariosFile}\` (one per project) — Test Scenarios`,
      `</expected_outputs>`,
      ``,
      `<strict_rules>`,
      `- CRITICAL: Confine all refinement, tasks, and scenarios exclusively to the <target_feature>. Ignore other features present in the <background_context> or the backlog file.`,
      `- DEPENDENCY RULE: If the <target_feature> has dependencies listed in the backlog, acknowledge them as assumptions or interfaces in your design, but DO NOT design, spec, or generate tasks for the dependencies themselves.`,
      ...(complexity !== undefined
        ? [`- COMPLEXITY OVERRIDE: Classify as '${complexity}' — do not re-evaluate scope complexity.`]
        : []),
      `- Execute autonomously without pausing or asking for confirmation.`,
      `- Write every file to disk before advancing to the next.`,
      `- Do NOT output explanations — produce the spec files only.`,
      `</strict_rules>`,
    ].join("\n");
  }

  // Appends dev tasks to DEVELOPMENT-STATE.md, falling back to a targeted agent call
  // if the tactical-design file was written but the JSON block is unreadable by the parser.
  private async ensureTasksAppended(
    feature: Feature,
    context: PhaseContext,
  ): Promise<void> {
    const existing = context.fsm
      .loadDevelopmentState()
      .filter((t) => t.featureId === feature.id);
    if (existing.length > 0) return;

    let extracted = context.extractTasksFromTacticalDesign(feature.domain);

    if (extracted.length === 0) {
      extracted = await this.recoverTasksViaAgent(feature, context);
    }

    if (extracted.length === 0) {
      throw new Error(
        `Phase A failed: no tasks extracted for feature ${feature.id} (domain '${feature.domain}'). ` +
        `Verify that docs/specs/${feature.domain}/003-*-tactical-design.md contains a valid JSON array under "## Section 6 — Ordered Development Tasks".`,
      );
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

  // Last-resort recovery: asks the agent to read the 003 doc and write the missing rows
  // directly into DEVELOPMENT-STATE.md, then re-runs the local parser.
  private async recoverTasksViaAgent(
    feature: Feature,
    context: PhaseContext,
  ): Promise<ExtractedTask[]> {
    const projectPathsList = context.config.projectPaths
      .map((p) => `- ${p}`)
      .join("\n");

    const tacticalDesignFile = join(context.workingDir, 'docs', 'specs', feature.domain, `003-*-tactical-design.md`)

    await context.invokeAgent({
      skill: "scope-refinement",
      agent: "software-architect",
      mode: "autonomous",
      phaseKey: "phase_a",
      prompt: [
        `## Objective`,
        `Extract ordered development tasks from the tactical design and append them to DEVELOPMENT-STATE.md.`,
        ``,
        `<skill_context>`,
        `Invoke the \`/scope-refinement\` skill before starting.`,
        `You are operating as the \`software-architect\` agent.`,
        `</skill_context>`,
        ``,
        `<project_paths>`,
        projectPathsList,
        `</project_paths>`,
        ``,
        `Read all files matching \`${tacticalDesignFile}\`.`,
        `Locate "## Section 6 — Ordered Development Tasks" and parse the JSON array in the fenced code block immediately following it.`,
        `For each task object, append a row to docs/product/DEVELOPMENT-STATE.md using this format:`,
        `| ${feature.id} | T<zero-padded id> | <project path> | <title> | ${feature.domain} | - | NOT_STARTED |`,
        `where <project> is one of the last folder segment of the project path: \`project_paths\`.`,
        `Do not output anything else.`,
      ].join(" "),
    });
    const reloadedTasks = context.fsm
      .loadDevelopmentState()
      .filter((t) => t.featureId === feature.id);
    return reloadedTasks.map((t) => ({
      taskId: t.taskId,
      description: t.description,
      file: t.project,
    }));
  }
}
