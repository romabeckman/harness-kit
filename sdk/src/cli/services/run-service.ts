import { input, select } from "@inquirer/prompts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { HarnessOrchestrator } from "../../orchestrator/HarnessOrchestrator";
import { AgentRunnerFactory } from "../../agent-runner/AgentRunnerFactory";
import { HarnessSettings } from "../../settings/HarnessSettings";
import { StartupBanner } from "../../ui/StartupBanner";
import { AnsiHelpers } from "../../ui/AnsiHelpers";
import {
  DEFAULT_LINE_LENGTH,
  DEFAULT_SCORE,
  DEFAULT_REWORKS,
} from "../utils/constants";
import { ResetOptions, resetOptions } from "./reset-service";

export interface RunOptions {
  agentType?: string;
  model?: string;
}

export async function cmdRun(cwd: string, runArgs: string[]): Promise<void> {
  const options: RunOptions = {};

  for (let i = 0; i < runArgs.length; i++) {
    const arg = runArgs[i];
    if (arg === "--copilot") {
      options.agentType = "copilot";
    } else if (arg === "--gemini") {
      options.agentType = "gemini";
    } else if (arg === "--agent" || arg === "-a") {
      options.agentType = runArgs[++i];
    } else if (arg === "--model" || arg === "-m") {
      options.model = runArgs[++i];
    }
  }
  const settings = HarnessSettings.load(cwd);
  const productDir = join(cwd, "docs", "product");
  const backlogPath = join(productDir, "BACKLOG.md");
  const hasExistingSession = existsSync(backlogPath);

  console.log(
    "\n" +
    StartupBanner.render(process.stdout.columns || DEFAULT_LINE_LENGTH) +
    "\n",
  );

  const action = hasExistingSession
    ? await select({
      message: "What would you like to do?",
      choices: [
        { name: "resume — continue from last session", value: "resume" },
        {
          name: "reset  — discard current session and start a new cycle",
          value: "reset",
        },
      ],
    })
    : "reset";

  let steeringMessage = "";
  let optionsReset: ResetOptions | null = null;
  if (action === "reset") {
    optionsReset = await resetOptions(cwd);
    steeringMessage = optionsReset.steeringMessage;
  } else {
    steeringMessage = await input({
      message: "Steering rules or state overrides (optional):",
      default: "",
    });
  }

  console.log("\n── Starting orchestration ──────────────────────────────");
  if (action === "reset") {
    console.log(
      `  scope:  ${optionsReset?.scope.slice(0, DEFAULT_LINE_LENGTH)}${optionsReset?.scope ? (optionsReset.scope.length > DEFAULT_LINE_LENGTH ? "…" : "") : ""}`,
    );
    console.log(`  paths:  ${optionsReset?.projectPaths?.join(", ")}`);
    console.log(`  score:  ${optionsReset?.score}`);
    console.log(`  reworks: ${optionsReset?.reworks}`);
  } else {
    console.log("  resuming from existing session");
  }
  if (steeringMessage) {
    console.log(
      `  steering:  ${steeringMessage.slice(0, DEFAULT_LINE_LENGTH)}${steeringMessage.length > DEFAULT_LINE_LENGTH ? "…" : ""}`,
    );
  }
  console.log("────────────────────────────────────────────────────────\n");

  if (action === "reset" && existsSync(productDir)) {
    const { rmSync } = await import("node:fs");
    rmSync(productDir, { recursive: true, force: true });
  }

  const agentRunner = options.agentType
    ? AgentRunnerFactory.create({
      type: options.agentType,
      model: options.model,
    })
    : undefined;

  const orchestrator = new HarnessOrchestrator({
    scope: optionsReset?.scope ?? "",
    projectPaths: optionsReset?.projectPaths ?? [],
    score: optionsReset?.score ?? DEFAULT_SCORE,
    reworks: optionsReset?.reworks ?? DEFAULT_REWORKS,
    productDir,
    agentRunner,
    settings,
    initialRules: steeringMessage.length > 0 ? steeringMessage : undefined,
  });

  if (action === "resume") {
    const state = orchestrator.getState();
    const phaseDesc = orchestrator.getPhaseDescription(state.currentPhase);
    console.log(
      `\n${AnsiHelpers.blue("►")} ${AnsiHelpers.dim("Current State:")} ${AnsiHelpers.cyan(phaseDesc)}`,
    );
    if (state.activeFeatureId) {
      console.log(
        `  ${AnsiHelpers.dim("Active Feature:")} ${state.activeFeatureId}`,
      );
    }
  }

  if (action === "resume" && steeringMessage.trim()) {
    if (options.agentType === "antigravity") {
      console.log(
        `\n${AnsiHelpers.green("✓")} Applying steering rule directly for antigravity...`,
      );
      const actions = [{ type: "add_rule" as const, rule: steeringMessage }];
      orchestrator.applySteeringActions(actions);
      console.log();
    } else {
      console.log("\nAnalyzing steering message...");
      const { SteeringAnalyzer } =
        require("../../orchestrator/SteeringAnalyzer") as typeof import("../../orchestrator/SteeringAnalyzer");
      // Use explicit agentRunner or fall back to a default runner for steering analysis
      const steeringRunner =
        agentRunner ?? AgentRunnerFactory.create({ type: "claude-cli" });
      const actions = await SteeringAnalyzer.analyze(
        steeringMessage,
        steeringRunner,
      );
      if (actions.length > 0) {
        console.log(
          `${AnsiHelpers.green("✓")} Applying ${actions.length} steering action(s)...`,
        );
        orchestrator.applySteeringActions(actions);
        console.log();
      } else {
        console.log("No actionable steering instructions detected.\n");
      }
    }
  }

  await orchestrator.run();
  console.log("\n✓ All features completed.");
  orchestrator.tokenReport();
}
