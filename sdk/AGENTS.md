# Agent Invocations in Harness Kit SDK

This document describes all `invokeAgent` calls executed during the Harness Kit orchestrator lifecycle.

## Overview of the Process

The orchestration process follows a Chain of Responsibility pattern. Each phase handler represents a stage in the software development lifecycle:

1. **Bootstrap Phase**: Synthesizes the project backlog from raw scope.
2. **Phase A (Planning)**: Refines scope and produces tactical specs and test scenarios.
3. **Phase B (Implementation)**: Runs the TDD development loop.
4. **Phase C (Validation)**: Validates code quality and safety via two sequential QA agents.
5. **Phase D (State Check)**: Evaluates completion criteria — **no agent call, pure state management**.
6. **Phase E (Memory)**: Documents the changes in the permanent project memory.

During these phases, the orchestrator delegates tasks to specialized subagents by calling `invokeAgent()` defined in `HarnessOrchestrator`.

> [!NOTE]
> The `skill` field in each invocation is **metadata only**. It is used for logging, terminal progress display, and token ledger recording. The runner does **not** load or resolve any skill file at runtime. What drives agent behavior is the `prompt` or `payload`.

---

## Agent Invocations Table

| Phase / Handler | Skill (metadata) | Agent | Prompt Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Bootstrap**<br>[BootstrapHandler.ts](./src/orchestrator/phases/BootstrapHandler.ts) | `autonomous-orchestrator:bootstrap` | `software-architect` | Custom `prompt` string | Parses project scope and generates the initial `BACKLOG.md` table with feature IDs, priorities and statuses. |
| **Phase A** (Planning)<br>[PhaseAHandler.ts](./src/orchestrator/phases/PhaseAHandler.ts) | `scope-refinement` | `software-architect` | `ContextAssembler.buildPhaseAPayload()` | Refines feature scope, defines bounded context, generates tactical design specs and test scenarios under `docs/specs/{domain}/`. |
| **Phase B** (Implementation)<br>[PhaseBHandler.ts](./src/orchestrator/phases/PhaseBHandler.ts) | `tdd-orchestrator` | `developer-backend` | `ContextAssembler.buildPhaseBPayload()` | Executes TDD cycles — writes tests first, then production code until `TDD-OUTPUT.json` is produced. Re-runs with rework log when retrying. |
| **Phase C** (Tech Lead review)<br>[PhaseCHandler.ts](./src/orchestrator/phases/PhaseCHandler.ts) | `the-grumpy-tech-lead` | `harness-tech-lead` | `ContextAssembler.buildPhaseCPayload()` | Sequential call #1: technical code review for conventions, patterns, and architectural integrity. Returns `scoreTL` in JSON. |
| **Phase C** (Adversarial QA)<br>[PhaseCHandler.ts](./src/orchestrator/phases/PhaseCHandler.ts) | `adversarial-qa` | `harness-qa` | `ContextAssembler.buildPhaseCPayload()` | Sequential call #2 (same payload): adversarial testing for edge cases, vulnerabilities, and stability. Returns `scoreAdv`, `hasHighCriticalVuln`, `isCrashing` in JSON. |
| **Phase E** (Memory)<br>[PhaseEHandler.ts](./src/orchestrator/phases/PhaseEHandler.ts) | `project-memory` | `developer-backend` | `ContextAssembler.buildPhaseEPayload()` | Summarizes the completed cycle and writes permanent feature records to `docs/feature/{domain}.md`. |

> [!IMPORTANT]
> **Phase C calls are sequential, not parallel.** The tech lead agent runs and awaits completion before the adversarial QA agent starts. Both receive the same `payloadC` built from `ContextAssembler.buildPhaseCPayload()`.

---

## Prompt Construction

Invoications that pass a custom `prompt` (Bootstrap only) send that string directly to the agent. All other phases use `ContextAssembler` to build a structured `payload` object. If no explicit `prompt` is given, the runner serializes the payload as:

```
Skill: <skill-name>
Mode: autonomous

<JSON payload>
```

This serialization happens inside `ClaudeCLIRunner.#buildPrompt()` (and equivalent runners).

---

## Invocation Dispatch Internals

When `invokeAgent` is called on `PhaseContext` (implemented by `HarnessOrchestrator`):

1. **Timeout guard**: An `AbortController` is created with `config.timeoutMs` (default: unlimited).
2. **Progress UI**: `TerminalProgress.startSpinner()` shows the current phase and agent name in the terminal.
3. **Runner call**: The invocation is forwarded to the registered `IAgentRunner.run()`.
4. **Token recording**: On completion, `output.usage` is recorded to `docs/product/tokens.jsonl` via `TokenLedger`.
5. **Spinner stop**: `TerminalProgress.stopSpinner()` is always called in the `finally` block.

### Runner Execution (ClaudeCLIRunner example)

1. Spawns the `claude` CLI subprocess with flags: `--print`, `--output-format stream-json`, `--verbose`, `--dangerously-skip-permissions`.
2. Passes `--agent <name>` and optionally `--model` and `--effort`.
3. Writes the prompt to `stdin` and closes the pipe.
4. Reads NDJSON events from `stdout`: `assistant` (text/tool_use blocks), `result` (final output + usage).
5. On close: resolves with `AgentOutput` containing `stdout`, `raw`, `usage`, and parsed `artefacts` (JSON extracted from the result).

### Quota / Rate-limit Handling

If the agent returns an error matching `/rate.?limit|quota|overloaded/i`, the runner throws `AgentRunnerError` with code `QUOTA_EXCEEDED`. The orchestrator catches this, persists the current phase to disk, and halts gracefully — allowing a clean `hrns run` resume.
