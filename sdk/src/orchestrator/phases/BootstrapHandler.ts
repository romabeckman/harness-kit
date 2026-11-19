import { loadPrompt } from '../utils/PromptTemplate'
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Phase, CliCommand } from "../types";
import { AbstractPhaseHandler, Reviewontext } from "./AbstractPhaseHandler";
import { PhaseDecisionLogger } from "../services/PhaseDecisionLogger";
import {
  buildDocsOrientationSection,
  inlineOrReference,
} from "../utils/PromptHelpers";
import { getPlanningSource, getProductDir } from "../utils/PhaseFileUtils";
import { BacklogParser } from "../../file-state/parsers/BacklogParser";

export class BootstrapHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.BOOTSTRAP) {
      return super.handle(phase, context);
    }

    context.fsm.ensureProductFiles(context.config);

    const bootConfig = context.fsm.loadBootstrapConfig();

    if (context.config.cliCommand === CliCommand.INIT) {
      bootConfig.projectPaths = context.config.projectPaths;
      if (context.config.score !== undefined) {
        bootConfig.scoreThresholdTL = context.config.score;
        bootConfig.scoreThresholdAdv = context.config.score;
      }
      if (context.config.reworks !== undefined) {
        bootConfig.completionCriteria = {
          maxReworks: context.config.reworks,
        };
      }
      if (context.config?.initialRules) {
        if (!bootConfig?.steeringRules) bootConfig.steeringRules = { user: [] };
        if (!bootConfig?.steeringRules?.user)
          bootConfig.steeringRules.user = [];
        bootConfig.steeringRules.user.push(context.config.initialRules);
      }
      context.fsm.saveBootstrapConfig(bootConfig);
    }

    const productDir = getProductDir(context);
    const backlogPath = join(productDir, "BACKLOG.md");
    const planningSource = getPlanningSource(context);
    const planningContent = planningSource.exists
      ? planningSource.content.trim()
      : context.config.scope.trim();

    await this.ensureProjectDocumentation(
      context,
      planningContent,
      planningSource.path,
    );

    const existing = context.fsm.loadBacklog();
    if (existing.length > 0) return Phase.PLANNING;

    const rulesList: string[] = [];
    if (bootConfig && bootConfig.steeringRules) {
      const configRules = bootConfig.steeringRules;
      if (configRules.bootstrap && configRules.bootstrap.length > 0) {
        for (const r of configRules.bootstrap) {
          rulesList.push(
            r.toLowerCase().startsWith("bootstrap") ? r : `Bootstrap: ${r}`,
          );
        }
      }
      if (configRules.user && configRules.user.length > 0) {
        rulesList.push(...configRules.user);
      }
    }

    const orientationSection = buildDocsOrientationSection(
      context.config.projectPaths,
      context.workingDir,
      undefined,
      undefined,
      context.config.agentRunner,
    );

    const prompt = loadPrompt('bootstrap/backlog', {
      backlogPath: backlogPath,
      projectPaths: context.config.projectPaths.join(', '),
      orientationSection: orientationSection,
      scopeSection: inlineOrReference('scope', planningContent, planningSource.path, 'markdown', 'always', context.config.agentRunner),
      lengthSection: rulesList.length > 0 ? loadPrompt('bootstrap/steering-rules', { rules: rulesList.map(r => `- ${r}`) }).split('\n') : [],
    });

    const output = await context.invokeAgent({
      agent: "harness-kit:software-architect",
      mode: "autonomous",
      prompt,
      phaseKey: "bootstrap",
    });

    let created = context.fsm.loadBacklog();
    if (created.length === 0 && output?.raw) {
      const parsed = BacklogParser.parse(output.raw);
      if (parsed.length > 0) {
        writeFileSync(backlogPath, output.raw.trim() + "\n", "utf-8");
        created = context.fsm.loadBacklog();
      }
    }
    PhaseDecisionLogger.logBootstrap(context.fsm, created);

    return Phase.PLANNING;
  }

  private async ensureProjectDocumentation(
    context: Reviewontext,
    planningContent: string,
    planningSourcePath: string,
  ): Promise<void> {
    const projectPaths = context.config.projectPaths ?? [];
    const missingDocsPaths = projectPaths.filter((projectPath) => {
      try {
        const docsPath = join(projectPath, "docs");
        return !existsSync(join(docsPath, ".digest.md")) ||
          !existsSync(join(docsPath, ".graph.json"));
      } catch {
        return true;
      }
    });

    if (missingDocsPaths.length === 0) return;

    console.log(
      `[BOOTSTRAP] Preparing project documentation before starting bootstrap: ${missingDocsPaths.join(", ")}`,
    );

    const prompt = loadPrompt('bootstrap/project-documentation', {
      scopeSection: inlineOrReference(
        "scope",
        planningContent,
        planningSourcePath,
        "markdown",
        "always",
        context.config.agentRunner,
      ),
      projectPaths: projectPaths.map((projectPath) => `- \`${projectPath}\``),
      missingDocsPaths: missingDocsPaths.map((projectPath) => `- \`${projectPath}\``),
    });

    await context.invokeAgent({
      agent: "harness-kit:software-architect",
      skill: "harness-kit:project-memory",
      mode: "autonomous",
      prompt,
      phaseKey: "bootstrap_project_memory",
    });
  }
}
