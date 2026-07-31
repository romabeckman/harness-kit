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
  effort?: string;
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
      return { complexity: Complexity.LOW, skipValidation: true, skipMemory: true }
    case RunMode.FAST:
      return { complexity: Complexity.LOW, skipValidation: false, skipMemory: false }
    case RunMode.DEEP_THINKING:
      return { complexity: Complexity.HIGH, skipValidation: false, skipMemory: false }
    case RunMode.THINKING:
    default:
      return { complexity: Complexity.AUTO, skipValidation: false, skipMemory: false }
  }
}

async function promptForMode(parsedMode?: RunMode): Promise<RunMode> {
  if (parsedMode) return parsedMode;
  return select({
    message: "Select execution mode:",
    choices: [
      { name: "quick", value: RunMode.QUICK, description: "Bootstrap → Planning → Development → Deploy (skips Review and Memory)" },
      { name: "fast", value: RunMode.FAST, description: "Bootstrap → Planning → Development → Review (Only QA) → Memory → Deploy" },
      { name: "Thinking", value: RunMode.THINKING, description: "Bootstrap → Planning → Development → Review → Memory → Deploy" },
      { name: "Deep Thinking", value: RunMode.DEEP_THINKING, description: "Bootstrap → Planning (Deep Thinking) → Development → Review → Memory → Deploy" },
    ],
    default: RunMode.THINKING,
  });
}

async function determineAction(parsedAction?: RunAction, hasExistingSession?: boolean): Promise<RunAction> {
  if (!hasExistingSession) return "reset";
  if (parsedAction) return parsedAction;
  return select({
    message: "What would you like to do?",
    choices: [
      { name: "resume — continue from last session", value: "resume" },
      { name: "reset  — discard current session and start a new cycle", value: "reset" },
    ],
  });
}

async function resolveResetOptions(
  cwd: string,
  parsed: ReturnType<typeof parseRunArgs>
): Promise<{ optionsReset: ResetOptions; steeringMessage: string }> {
  const hasCliResetArgs =
    parsed.scope !== undefined ||
    parsed.projectPaths.length > 0 ||
    parsed.score !== undefined ||
    parsed.reworks !== undefined;

  if (hasCliResetArgs) {
    const optionsReset = {
      scope: parsed.scope ?? "",
      projectPaths: parsed.projectPaths.length > 0 ? parsed.projectPaths : [cwd],
      score: parsed.score ?? DEFAULT_SCORE,
      reworks: parsed.reworks ?? DEFAULT_REWORKS,
      steeringMessage: parsed.steeringMessage ?? "",
    };
    return { optionsReset, steeringMessage: optionsReset.steeringMessage };
  } else {
    const optionsReset = await resetOptions(cwd);
    let steeringMessage = optionsReset.steeringMessage;
    if (parsed.steeringMessage !== undefined) {
      steeringMessage = parsed.steeringMessage;
      optionsReset.steeringMessage = steeringMessage;
    }
    return { optionsReset, steeringMessage };
  }
}

async function resolveResumeOptions(parsed: ReturnType<typeof parseRunArgs>): Promise<string> {
  if (parsed.steeringMessage !== undefined) return parsed.steeringMessage;
  return input({
    message: "Steering rules or state overrides (optional):",
    default: "",
  });
}

function logOrchestrationStart(
  action: RunAction,
  optionsReset: ResetOptions | null,
  steeringMessage: string,
  modeLabel: RunMode | string,
  skipValidation: boolean,
  skipMemory: boolean,
  skipDeploy: boolean
) {
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
}

async function applySteeringRules(
  orchestrator: HarnessOrchestrator,
  agentRunner: any,
  options: RunOptions,
  steeringMessage: string
) {
  if (!steeringMessage.trim()) return;

  if (options.agentType === "antigravity-cli") {
    console.log(`\n${AnsiHelpers.green("✓")} Applying steering rule directly for antigravity-cli...`);
    const actions = [{ type: "add_rule" as const, rule: steeringMessage }];
    orchestrator.applySteeringActions(actions);
    console.log();
  } else {
    console.log("\nAnalyzing steering message...");
    const { SteeringAnalyzer } = require("../../orchestrator/SteeringAnalyzer") as typeof import("../../orchestrator/SteeringAnalyzer");
    const steeringRunner = agentRunner ?? AgentRunnerFactory.create({ type: "claude-cli" });
    const actions = await SteeringAnalyzer.analyze(steeringMessage, steeringRunner);
    if (actions.length > 0) {
      console.log(`${AnsiHelpers.green("✓")} Applying ${actions.length} steering action(s)...`);
      orchestrator.applySteeringActions(actions);
      console.log();
    } else {
      console.log("No actionable steering instructions detected.\n");
    }
  }
}

export async function cmdRun(cwd: string, runArgs: string[], isFromInit?: boolean): Promise<void> {
  const parsed = parseRunArgs(runArgs)
  if (parsed.debug) {
    DebugContext.enable()
  }

  const options: RunOptions = {
    agentType: parsed.agentType,
    model: parsed.model,
    effort: parsed.effort,
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

  parsed.mode = await promptForMode(parsed.mode);

  const resolved = resolveMode(parsed.mode)
  const skipValidation = resolved.skipValidation || !!parsed.skipValidation
  const skipMemory = resolved.skipMemory || !!parsed.skipMemory
  const skipDeploy = !!parsed.skipDeploy

  const action = await determineAction(parsed.action, !!hasExistingSession);

  let steeringMessage = "";
  let optionsReset: ResetOptions | null = null;

  if (action === "reset") {
    const resetResult = await resolveResetOptions(cwd, parsed);
    optionsReset = resetResult.optionsReset;
    steeringMessage = resetResult.steeringMessage;
  } else {
    steeringMessage = await resolveResumeOptions(parsed);
  }

  logOrchestrationStart(
    action,
    optionsReset,
    steeringMessage,
    parsed.mode ?? RunMode.THINKING,
    skipValidation,
    skipMemory,
    skipDeploy
  );

  if (action === "reset" && existsSync(productDir) && !isFromInit) {
    const { rmSync } = await import("node:fs");
    rmSync(productDir, { recursive: true, force: true });
  }

  const agentRunner = AgentRunnerFactory.create({
    type: options.agentType ?? Runner.CLAUDE_CLI,
    model: options.model,
    effort: options.effort,
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

    await applySteeringRules(orchestrator, agentRunner, options, steeringMessage);
  }

  await orchestrator.run();
  console.log("\n✓ All features completed.");
  orchestrator.tokenReport();
}
