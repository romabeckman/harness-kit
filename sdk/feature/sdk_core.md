# sdk_core — HarnessOrchestrator SDK

The `sdk_core` module is a TypeScript npm package (`harness-kit-sdk`) that implements the autonomous-orchestrator state machine as an importable library. It provides a `HarnessOrchestrator` class and all supporting ports, adapters, and utility types needed to drive a full orchestration cycle.

---

## Public API (`sdk/src/index.ts`)

### Orchestrator

| Export | Kind | Description |
|---|---|---|
| `HarnessOrchestrator` | class | Main entry point. Drives the state machine loop. |
| `HarnessOrchestratorOptions` | type | Constructor options for `HarnessOrchestrator`. |
| `Phase` | enum | `BOOTSTRAP \| PHASE_A \| PHASE_B \| PHASE_C \| PHASE_D \| PHASE_E \| CASCADE_BLOCKED \| HALTED` |
| `OrchestratorConfig` | type | `scope`, `projectPaths`, `agentRunner`, `productDir?` |
| `OrchestratorState` | type | `currentPhase`, `activeFeatureId`, `completedCycles` |
| `PhaseTransition` | type | `from`, `condition`, `to` |

### Agent Runner (outbound port)

| Export | Kind | Description |
|---|---|---|
| `IAgentRunner` | interface | Outbound port. Callers inject a concrete implementation. |
| `NullAgentRunner` | class | No-op stub; returns empty output. Intended for F003 to replace. |
| `AgentInvocation` | type | Input to `IAgentRunner.run()`. |
| `AgentOutput` | type | Output from `IAgentRunner.run()`. |
| `ContextPayload` | type | Structured payload passed to the agent. |

### File State (inbound port + default adapter)

| Export | Kind | Description |
|---|---|---|
| `IFileStateManager` | interface | All file I/O operations the orchestrator needs. |
| `FileStateManager` | class | Default adapter — reads/writes markdown files atomically. |
| `FileStateManagerOptions` | type | `productDir`, `workingDir?` |
| `Feature`, `Task`, `BootstrapConfig` | types | Core domain value objects. |
| `FeatureStatus`, `TaskStatus`, `CurrentPhase` | types | Enumeration strings for status fields. |

### Validation Gate

| Export | Kind | Description |
|---|---|---|
| `ValidationGate` | class | Pure `evaluate(scores)` function. No side effects. |
| `Verdict` | enum | `PASS \| REWORK \| HALT` |
| `ValidationScores`, `VerdictResult` | types | Input/output of `evaluate()`. |

### JSON Extraction

| Export | Kind | Description |
|---|---|---|
| `JsonExtractionProtocol` | class | Defensive JSON parser — never throws. |
| `ExtractionResult`, `ExtractionError`, `ExtractionOutcome` | types | Union outcome from extraction. |
| `isExtractionError`, `isExtractionResult` | functions | Type guards for the outcome union. |

### Context Assembler

| Export | Kind | Description |
|---|---|---|
| `ContextAssembler` | class | Builds per-phase `ContextPayload` objects from current state. |
| `PhaseAPayload`, `PhaseBPayload`, `PhaseCPayload`, `PhaseEPayload` | types | Typed payload shapes per phase. |

---

## Folder Structure

```
sdk/
  src/
    index.ts                          # Public re-exports only
    orchestrator/
      HarnessOrchestrator.ts          # State machine loop
      StateMachine.ts                 # Pure phase transition function
      ReentryResolver.ts              # Ordered predicate table (first match wins)
      types.ts                        # OrchestratorConfig, Phase, OrchestratorState, OnDiskState
    file-state/
      FileStateManager.ts             # IFileStateManager implementation
      types.ts                        # Feature, Task, BootstrapConfig, status enums
      parsers/
        BacklogParser.ts              # Markdown table → Feature[]
        DevStateParser.ts             # Markdown table → Task[]
        BootstrapConfigParser.ts      # JSON → BootstrapConfig
    agent-runner/
      IAgentRunner.ts                 # Outbound port interface
      NullAgentRunner.ts              # No-op stub
      types.ts                        # AgentInvocation, AgentOutput, ContextPayload
    validation-gate/
      ValidationGate.ts              # Pure evaluate() function
      types.ts                        # ValidationScores, VerdictResult, Verdict
    context-assembler/
      ContextAssembler.ts            # Per-phase payload builders
      types.ts                        # PhasePayloadRequest, phase payload types
    json-extraction/
      JsonExtractionProtocol.ts      # Defensive JSON parser
      types.ts                        # ExtractionResult, ExtractionError, type guards
  tests/
    helpers/
      FakeAgentRunner.ts             # Test double for IAgentRunner
    # 15 test suites (unit + integration)
  package.json                        # harness-kit-sdk, Vitest, strict TypeScript
  tsconfig.json
  tsconfig.build.json
```

---

## Architectural Decisions

### Ports-and-Adapters

The orchestrator domain (`orchestrator/`) has zero runtime dependencies outside the standard library. All I/O is accessed through two interfaces:

- `IFileStateManager` — inbound port; `FileStateManager` is the default adapter.
- `IAgentRunner` — outbound port; callers inject their own implementation. `NullAgentRunner` is the provided stub.

This boundary means the entire domain can be tested without touching the filesystem or spawning agents.

### Atomic Writes

`FileStateManager` writes all files via a write-to-temp-then-rename pattern (`atomicWrite`). A crash between write and rename leaves a `.tmp` orphan, not a corrupt target file.

### Never-Throws JSON Extraction

`JsonExtractionProtocol` returns an `ExtractionOutcome` union (`ExtractionResult | ExtractionError`) and never throws. Callers use the `isExtractionError` / `isExtractionResult` type guards to branch.

### ReentryResolver — Ordered Predicate Table

`ReentryResolver` encodes the full State Transition Table as an ordered list of predicates. The first matching predicate wins. This avoids a large switch/case and makes new transitions addable in one place.

### Crash Recovery via persistPhase

`currentPhase` is persisted into `BOOTSTRAP-CONFIG.json` after every transition so the orchestrator can resume from the correct phase after an unexpected exit.

---

## Known Limitations / Open Items

These issues were identified during validation and are NOT yet fixed:

1. **loadRecentDecisions / appendDecision format mismatch** — `appendDecision` writes entries with a specific markdown structure; `loadRecentDecisions` reads lines without accounting for that structure. The last N decisions returned may be malformed.

2. **domain parameter sanitization scope** — The `^[a-zA-Z0-9_-]+$` regex guard is applied only inside `writeReworkLog`. Other methods that accept a `featureId` or `domain` string do not sanitize before constructing file paths.

3. **updateTaskStatus silent no-op** — If the given `featureId` + `taskId` pair is not found in `DEVELOPMENT-STATE.md`, the method returns without writing and without signaling an error. Callers cannot distinguish "updated" from "not found".

4. **persistPhase silent catch** — The phase persistence write is wrapped in a try/catch that swallows errors. A write failure will not surface to the orchestrator loop, leaving on-disk state stale.
