import { input, select } from "@inquirer/prompts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { HarnessOrchestrator } from "../../orchestrator/HarnessOrchestrator";
import { ChainBuilder } from "../../orchestrator/ChainBuilder";
import { CliCommand, Complexity, RunMode } from "../../orchestrator/types";
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
import { parseRunArgs } from "../utils/run-args-parser";
import { DebugContext } from "../DebugContext";
import { Runner } from "../../agent-runner/types";
import { FileStateManager } from "../../file-state/FileStateManager";

export interface RunOptions {
  agentType?: string;
  model?: string;
}

export type RunAction = "reset" | "resume"

interface ResolvedMode {
  complexity: Complexity
  skipValidation: boolean
  skipMemory: boolean
}

/**
 * Maps `--mode` to the complexity level and skip flags it implies.
 *
 * Individual `--skip-*` flags passed at the CLI are OR'd on top of these
 * defaults inside `cmdRun`, so the user can always add extra skips.
 */
export function resolveMode(mode?: RunMode): ResolvedMode {
  switch (mode) {
    case RunMode.QUICK:
      return { complexity: Complexity.AUTO, skipValidation: true, skipMemory: true }
    case RunMode.FAST:
      return { complexity: Complexity.LOW, skipValidation: false, skipMemory: false }
    case RunMode.SLOW:
      return { complexity: Complexity.HIGH, skipValidation: false, skipMemory: false }
    case RunMode.DEFAULT:
    default:
      return { complexity: Complexity.AUTO, skipValidation: false, skipMemory: false }
  }
}

export async function cmdRun(cwd: string, runArgs: string[], isFromInit?: boolean): Promise<void> {
  const parsed = parseRunArgs(runArgs)
  if (parsed.debug) {
    DebugContext.enable()
  }

  const resolved = resolveMode(parsed.mode)
  // Individual --skip-* flags are OR'd on top of the mode defaults
  const skipValidation = resolved.skipValidation || !!parsed.skipValidation
  const skipMemory = resolved.skipMemory || !!parsed.skipMemory
  const skipDeploy = !!parsed.skipDeploy

  const options: RunOptions = {
    agentType: parsed.agentType,
    model: parsed.model,
  }

  const settings = HarnessSettings.load(cwd)
  const productDir = join(cwd, "docs", "product")
  const fsm = new FileStateManager({
    productDir,
    workingDir: cwd,
  })
  const bootConfig = fsm.existBootstrapConfig() ? fsm.loadBootstrapConfig() : undefined
  const hasExistingSession = bootConfig && fsm.existScope() && bootConfig.projectPaths && bootConfig.projectPaths.length > 0

  console.log(
    "\n" +
    StartupBanner.render(process.stdout.columns || DEFAULT_LINE_LENGTH) +
    "\n",
  )

  let action: RunAction = "reset"

  if (hasExistingSession) {
    action = parsed.action ?? await select({
      message: "What would you like to do?",
      choices: [
        { name: "resume — continue from last session", value: "resume" },
        { name: "reset  — discard current session and start a new cycle", value: "reset" },
      ],
    })
  }

  // Determine action: use CLI flag when provided, otherwise prompt interactively.
  // let action: "reset" | "resume" = parsed.action ??
  //   (hasExistingSession ?
  //     await select({
  //       message: "What would you like to do?",
  //       choices: [
  //         { name: "resume — continue from last session", value: "resume" },
  //         {
  //           name: "reset  — discard current session and start a new cycle",
  //           value: "reset",
  //         },
  //       ],
  //     })
  //     : "reset");

  let steeringMessage = "";
  let optionsReset: ResetOptions | null = null;
  if (action === "reset") {
    // When reset fields are fully supplied via CLI args, skip the interactive wizard.
    const hasCliResetArgs =
      parsed.scope !== undefined ||
      parsed.projectPaths.length > 0 ||
      parsed.score !== undefined ||
      parsed.reworks !== undefined;

    if (hasCliResetArgs) {
      optionsReset = {
        scope: parsed.scope ?? "",
        projectPaths: parsed.projectPaths.length > 0 ? parsed.projectPaths : [cwd],
        score: parsed.score ?? DEFAULT_SCORE,
        reworks: parsed.reworks ?? DEFAULT_REWORKS,
        steeringMessage: parsed.steeringMessage ?? "",
      };
      steeringMessage = optionsReset.steeringMessage;
    } else {
      optionsReset = await resetOptions(cwd);
      steeringMessage = optionsReset.steeringMessage;
      // CLI --steering overrides the interactive prompt value.
      if (parsed.steeringMessage !== undefined) {
        steeringMessage = parsed.steeringMessage;
        optionsReset.steeringMessage = steeringMessage;
      }
    }
  } else {
    // resume: use CLI --steering when supplied, otherwise prompt.
    steeringMessage = parsed.steeringMessage
      ?? await input({
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
  const modeLabel = parsed.mode ?? RunMode.DEFAULT
  console.log(`  mode:     ${modeLabel}`);
  if (skipValidation) {
    console.log(`  skip-validation: true  (Phase REVIEW skipped)`);
  }
  if (skipMemory) {
    console.log(`  skip-memory: true  (Phase MEMORY skipped)`);
  }
  if (skipDeploy) {
    console.log(`  skip-deploy: true  (Phase DEPLOY skipped)`);
  }
  console.log("────────────────────────────────────────────────────────\n");

  if (action === "reset" && existsSync(productDir) && !isFromInit) {
    const { rmSync } = await import("node:fs");
    rmSync(productDir, { recursive: true, force: true });
  }

  const agentRunner = AgentRunnerFactory.create({
    type: options.agentType ?? Runner.CLAUDE_CLI,
    model: options.model,
  })

  const orchestrator = new HarnessOrchestrator({
    scope: optionsReset?.scope ?? "",
    projectPaths: optionsReset?.projectPaths ?? [],
    score: optionsReset?.score ?? DEFAULT_SCORE,
    reworks: optionsReset?.reworks ?? DEFAULT_REWORKS,
    productDir,
    agentRunner,
    settings,
    initialRules: steeringMessage.length > 0 ? steeringMessage : undefined,
    complexity: resolved.complexity,
    chain: ChainBuilder.buildDefault(),
    cliCommand: isFromInit ? CliCommand.INIT : CliCommand.RUN,
    skipValidation,
    skipMemory,
    skipDeploy,
  });

  if (action === "resume") {
    const state = orchestrator.getState();
    console.log(
      `\n${AnsiHelpers.blue("►")} ${AnsiHelpers.dim("Current State:")} ${AnsiHelpers.cyan(state.currentPhase)}`,
    );
    if (state.activeFeatureId) {
      console.log(
        `  ${AnsiHelpers.dim("Active Feature:")} ${state.activeFeatureId}`,
      );
    }
  }

  if (action === "resume" && steeringMessage.trim()) {
    if (options.agentType === "antigravity-cli") {
      console.log(
        `\n${AnsiHelpers.green("✓")} Applying steering rule directly for antigravity-cli...`,
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
