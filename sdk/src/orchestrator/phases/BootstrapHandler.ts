import { writeFileSync } from "node:fs";
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

    const existing = context.fsm.loadBacklog();
    if (existing.length > 0) return Phase.PLANNING;

    const productDir = getProductDir(context);
    const backlogPath = join(productDir, "BACKLOG.md");
    const planningSource = getPlanningSource(context);
    const planningContent = planningSource.exists
      ? planningSource.content.trim()
      : context.config.scope.trim();

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

    const promptLines = [
      `# ROLE`,
      `You are a software architect defining the implementation backlog from validated business context. Generate a \`BACKLOG.md\` table with all cohesive product features.`,
      ``,
      `# OBJECTIVE`,
      `Parse the project scope below and generate the \`BACKLOG.md\` table. Write it to: \`${backlogPath}\``,
      ``,
      `# OUTPUT FORMAT`,
      `Table columns (exact):`,
      `| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |`,
      ``,
      `# COLUMN RULES`,
      `- ID: F001, F002, ... (sequential, no gaps)`,
      `- Title: short description with objective (max 500 chars)`,
      `- Domain: is unique, never repeat, snake_case, max 50 characters`,
      `- Agent: \`backend\` | \`frontend\` | \`qa\` | \`devops\` — infer from feature scope and project paths`,
      `- Priority: CRITICAL (only if mission-critical, core functionality, or security), HIGH, MEDIUM, or LOW`,
      `- Dependencies: comma-separated IDs, or None`,
      `- Reworks: 0 | Score (TL) & Score (Adv): - | Status: NOT_STARTED`,
      `- Output ONLY the markdown table, no additional text.`,
      `- Preserve human-validated decisions. Treat provisional model assumptions as assumptions.`,
      ``,
      `# FEATURE SIZING`,
      `Each feature has fixed pipeline overhead: scope refinement → TDD → tech lead review → QA review → documentation (4-7 agent calls per feature). Broader scope still increases context, testing, and rework risk. Prefer the fewest cohesive features that each remain independently implementable and testable in one cycle.`,
      `- A feature is a cohesive, independently testable functional increment that moves the project toward the final objective defined by the scope.`,
      `- Features MUST be progressive: each feature should produce a usable increment and, when applicable, build on or complement previous features until the complete scope objective is achieved.`,
      `- Order features according to their natural implementation sequence. Use Dependencies to explicitly represent when a later feature extends, integrates with, or requires an earlier feature.`,
      `- Think in functional increments and user-facing flows, not technical layers. A feature may include multiple files, technologies, or implementation steps when they are part of the same cohesive result.`,
      `- For small scopes, keep tightly related work together. Example: if a simple page only requires HTML plus its JavaScript behavior, create ONE feature containing both instead of separate "HTML" and "script" features.`,
      `- For larger scopes, split work only at meaningful functional boundaries. Example: first create the base screen or flow, then add a substantial interaction, integration, or complementary capability as a dependent feature.`,
      `- Group related work into ONE feature: all CRUD operations on the same entity, all endpoints of the same domain, tests with their implementation, and small UI behavior with the UI it supports.`,
      `- NEVER create artificial steps solely to increase the number of features. Do not create single-endpoint features, single-file features, configuration-only features (e.g. "add CORS"), or features that separate tests from implementation.`,
      `- The complete ordered set of features MUST collectively cover the scope objective without gaps or unrelated work.`,
      ``,
      `## Sizing examples`,
      `BAD (over-granulated, 7 features):`,
      `F001 Create page HTML | F002 Add page styles | F003 Add page JavaScript | F004 Add click handler | F005 Add validation | F006 Add API call | F007 Write tests`,
      ``,
      `GOOD (small scope, 1 cohesive feature):`,
      `F001 Interactive page — implement the HTML structure, required styling, JavaScript behavior, validation, and tests needed to satisfy the scoped page objective`,
      ``,
      `GOOD (larger scope, progressive features):`,
      `F001 Product Catalog — implement the base catalog screen with product rendering and core navigation`,
      `F002 Catalog Filtering — extend F001 with search, filters, and state handling`,
      `F003 Product Purchase Flow — build on the catalog to select a product, submit the purchase, handle responses, and complete the scoped user journey`,
    ];

    const orientationSection = buildDocsOrientationSection(
      context.config.projectPaths,
      context.workingDir,
      undefined,
      undefined,
      context.config.agentRunner,
    );

    promptLines.push(
      ``,
      `<context>`,
      `Project paths: ${context.config.projectPaths.join(", ")}`,
      `</context>`,
      ``,
      ...orientationSection,
      ...inlineOrReference(
        "scope",
        planningContent,
        planningSource.path,
        "markdown",
        "always",
        context.config.agentRunner,
      ),
    );

    if (rulesList.length > 0) {
      promptLines.push(
        ``,
        `# STEERING RULES`,
        ...rulesList.map((r) => `- ${r}`),
      );
    }
    const prompt = promptLines.join("\n");

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
}
