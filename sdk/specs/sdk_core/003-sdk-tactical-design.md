# Tactical Design — SDK Core (F001)

Domain: `sdk_core`
Project: `sdk`
Sources: `001-problem-space.md`, `002-context-map.md`

---

## 1. Architecture Style

Ports-and-Adapters (Hexagonal Architecture) in strict TypeScript.

- The domain (OrchestratorCore + ValidationGate) has zero runtime dependencies.
- All I/O (filesystem, agent invocation) is accessed through interfaces injected at construction.
- The SDK exports one public entry point: `HarnessOrchestrator`.
- No framework. No DI container. No decorators.

---

## 2. Module Structure

```
sdk/
├── src/
│   ├── index.ts                        # Public exports only
│   ├── orchestrator/
│   │   ├── HarnessOrchestrator.ts      # BC-1: public class, run(), state machine driver
│   │   ├── StateMachine.ts             # Phase transition evaluation (pure)
│   │   ├── ReentryResolver.ts          # Re-entry rule: scan table, return entry Phase
│   │   └── types.ts                    # OrchestratorConfig, OrchestratorState, Phase enum
│   ├── file-state/
│   │   ├── FileStateManager.ts         # BC-2: implements IFileStateManager
│   │   ├── parsers/
│   │   │   ├── BacklogParser.ts        # Markdown table → Feature[]
│   │   │   ├── DevStateParser.ts       # Markdown table → Task[]
│   │   │   └── BootstrapConfigParser.ts # JSON → BootstrapConfig
│   │   └── types.ts                    # Feature, Task, BootstrapConfig, FeatureStatus, TaskStatus
│   ├── agent-runner/
│   │   ├── IAgentRunner.ts             # BC-3: outbound port interface (stub for F003)
│   │   └── types.ts                    # AgentInvocation, AgentOutput, ContextPayload
│   ├── validation-gate/
│   │   ├── ValidationGate.ts           # BC-4: pure evaluate() function
│   │   └── types.ts                    # ValidationScores, VerdictResult, Verdict enum
│   ├── context-assembler/
│   │   ├── ContextAssembler.ts         # BC-5: per-phase payload builders
│   │   └── types.ts                    # PhasePayloadRequest
│   └── json-extraction/
│       ├── JsonExtractionProtocol.ts   # BC-6: defensive JSON parsing utility
│       └── types.ts                    # ExtractionResult, ExtractionError
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

---

## 3. Type Shapes

### 3.1 OrchestratorConfig and State

```typescript
// orchestrator/types.ts

export interface OrchestratorConfig {
  scope: string
  projectPaths: string[]
  agentRunner: IAgentRunner        // injected — implementation is F003
  productDir?: string              // defaults to "docs/product" relative to cwd
}

export enum Phase {
  BOOTSTRAP    = 'BOOTSTRAP',
  PHASE_A      = 'PHASE_A',
  PHASE_B      = 'PHASE_B',
  PHASE_C      = 'PHASE_C',
  PHASE_D      = 'PHASE_D',
  PHASE_E      = 'PHASE_E',
  CASCADE_BLOCKED = 'CASCADE_BLOCKED',
  HALTED       = 'HALTED',
}

export interface OrchestratorState {
  currentPhase: Phase
  activeFeatureId: string | null
  completedCycles: number
}

export type PhaseTransition = {
  from: Phase
  condition: string           // human-readable label matching State Transition Table
  to: Phase
}
```

### 3.2 Feature and Task (FileStateManager domain)

```typescript
// file-state/types.ts

export type FeatureStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED'

export type TaskStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED'

export type CurrentPhase = 'IMPLEMENTATION' | 'VALIDATION' | '-'

export interface Feature {
  id: string
  title: string
  domain: string
  priority: number
  dependencies: string[]       // list of Feature IDs
  reworks: number
  scoreTL: number | null
  scoreAdv: number | null
  status: FeatureStatus
}

export interface Task {
  featureId: string
  taskId: string
  project: string
  description: string
  domain: string
  currentPhase: CurrentPhase
  status: TaskStatus
}

export interface BootstrapConfig {
  scoreThresholds: {
    theGrumpyTechLead: { threshold: number }
    adversarialQA: { threshold: number }
  }
  completionCriteria: {
    maxReworks: number
  }
  cycleCounter: {
    completedCycles: number
  }
}
```

### 3.3 IAgentRunner interface (stub — F003 implements)

```typescript
// agent-runner/IAgentRunner.ts

export interface IAgentRunner {
  run(invocation: AgentInvocation): Promise<AgentOutput>
}

// agent-runner/types.ts

export interface AgentInvocation {
  skill: string
  agent: string
  mode: 'autonomous'
  payload: ContextPayload
}

export interface AgentOutput {
  raw: string
  artefacts?: Record<string, string>   // key = artefact name, value = file path or inline content
}

export type ContextPayload = Record<string, unknown>
```

### 3.4 ValidationGate types

```typescript
// validation-gate/types.ts

export interface ValidationScores {
  scoreTL: number
  scoreAdv: number
  hasHighCriticalVuln: boolean
  isCrashing: boolean           // true if failure would crash/break core functionality
}

export enum Verdict {
  PASS  = 'PASS',
  RETRY = 'RETRY',
  BLOCK = 'BLOCK',
  FAIL  = 'FAIL',
}

export interface VerdictResult {
  verdict: Verdict
  reason: string
}
```

### 3.5 IFileStateManager interface

```typescript
// file-state/FileStateManager.ts (interface section)

export interface IFileStateManager {
  // Bootstrap
  ensureProductFiles(): void
  loadBootstrapConfig(): BootstrapConfig
  saveBootstrapConfig(config: BootstrapConfig): void

  // Backlog
  loadBacklog(): Feature[]
  saveFeatureStatus(id: string, status: FeatureStatus, scores?: { tl: number; adv: number }): void
  incrementFeatureReworks(id: string): void

  // Development State
  loadDevelopmentState(): Task[]
  appendTasks(tasks: Task[]): void
  updateTaskStatus(taskId: string, phase: CurrentPhase, status: TaskStatus): void
  updateAllFeatureTasks(featureId: string, phase: CurrentPhase, status: TaskStatus): void

  // Decisions log
  appendDecision(text: string): void

  // Rework log
  writeReworkLog(domain: string, content: string): void
}
```

---

## 4. HarnessOrchestrator: State Machine Behavior

### 4.1 Construction

```typescript
class HarnessOrchestrator {
  constructor(config: OrchestratorConfig)
  run(): Promise<void>
}
```

`run()` drives the loop from current state to `HALTED`. It is re-entrant: if product files already exist, it applies the re-entry rule before executing any phase.

### 4.2 Phase Dispatch Table

Each phase is a private method that returns the next `Phase`:

| Method | Returns |
|---|---|
| `runBootstrap()` | `Phase.PHASE_A` |
| `runPhaseA(feature)` | `Phase.PHASE_B` or `Phase.CASCADE_BLOCKED` |
| `runPhaseB(feature)` | `Phase.PHASE_C` |
| `runPhaseC(feature)` | `Phase.PHASE_D` |
| `runPhaseD()` | `Phase.PHASE_E` |
| `runPhaseE(feature)` | `Phase.PHASE_A` or `Phase.HALTED` |

The main `run()` loop:

```
WHILE currentPhase !== HALTED:
  1. Persist currentPhase to BOOTSTRAP-CONFIG.json (before executing)
  2. Dispatch to phase method
  3. Receive next Phase
  4. Persist transition to DECISIONS.md
  5. Set currentPhase = next Phase
```

### 4.3 Re-entry Rule

`ReentryResolver.resolve(state: OnDiskState): Phase` scans the State Transition Table in order and returns the first Phase whose entry condition matches the current on-disk state. OnDiskState is a snapshot read from all product files at startup.

### 4.4 Token Optimization Contract

Each phase method calls `ContextAssembler.build{Phase}Payload(...)`, which returns only the fields needed for that invocation. The `IAgentRunner.run()` receives a `ContextPayload` — never a full product file dump.

---

## 5. Validation Gate Logic

`ValidationGate.evaluate(scores, reworks, config, isCrashing): VerdictResult`

This is a pure function. No I/O. No side effects.

```
IF scoreTL >= thresholdTL AND scoreAdv >= thresholdAdv AND NOT hasHighCriticalVuln
    → PASS

IF (scoreTL < thresholdTL OR scoreAdv < thresholdAdv OR hasHighCriticalVuln)
   AND reworks < maxReworks
    → RETRY

IF (scoreTL < thresholdTL OR scoreAdv < thresholdAdv OR hasHighCriticalVuln)
   AND reworks >= maxReworks
   AND isCrashing
    → BLOCK

IF (scoreTL < thresholdTL OR scoreAdv < thresholdAdv OR hasHighCriticalVuln)
   AND reworks >= maxReworks
   AND NOT isCrashing
    → FAIL
```

---

## 6. Ordered Development Tasks

Each task is independently implementable in one session (2-4 hours). Tasks are ordered by dependency: each task may depend only on tasks that precede it.

| # | Task | Scope | Deliverable |
|---|---|---|---|
| T01 | Initialize `sdk/` project scaffold | Create `package.json`, `tsconfig.json`, `tsconfig.build.json`. Configure strict mode, `outDir: dist`, `rootDir: src`. No runtime deps; devDeps: `typescript` only at this stage. | Compilable empty TypeScript project |
| T02 | Define all shared type files | Write `orchestrator/types.ts`, `file-state/types.ts`, `agent-runner/types.ts`, `validation-gate/types.ts`, `context-assembler/types.ts`, `json-extraction/types.ts`. No logic — types only. | All type definitions compile with zero errors |
| T03 | Implement `IAgentRunner` stub interface | Write `agent-runner/IAgentRunner.ts`. Export the interface. Write a `NullAgentRunner` class in `agent-runner/NullAgentRunner.ts` that throws `NotImplementedError` on every call. Used in tests. | Interface + NullAgentRunner compile; F003 is not blocked |
| T04 | Implement `JsonExtractionProtocol` | Write `json-extraction/JsonExtractionProtocol.ts`. Implement the four-step extraction algorithm from SKILL.md Section 3. Return `ExtractionResult` (success) or `ExtractionError` (failure). | Pure function, no I/O |
| T05 | Implement `ValidationGate` | Write `validation-gate/ValidationGate.ts`. Implement the four verdict branches as a pure function matching Section 5 of this document exactly. | Pure function, no I/O |
| T06 | Implement `FileStateManager` parsers | Write `file-state/parsers/BacklogParser.ts`, `DevStateParser.ts`, `BootstrapConfigParser.ts`. Each parser converts its file format to its typed domain object. Handle missing columns gracefully (use defaults). | Parsers compile; handle malformed input without throwing |
| T07 | Implement `FileStateManager` class | Write `file-state/FileStateManager.ts`. Implement `IFileStateManager` in full. Use Node.js `fs` module only. All write operations are atomic: write to temp file, rename to target. Implement `ensureProductFiles()` by copying from skill model templates. | All interface methods implemented; no direct fs usage outside this class |
| T08 | Implement `ContextAssembler` | Write `context-assembler/ContextAssembler.ts`. Implement the four `build{Phase}Payload` methods from Section 3.5 of `002-context-map.md`. Each method reads only the fields it needs from its arguments — no extra fields. | All four builders compile and return typed payloads |
| T09 | Implement `ReentryResolver` | Write `orchestrator/ReentryResolver.ts`. Implement `resolve(state: OnDiskState): Phase`. The resolver encodes the State Transition Table conditions as ordered predicates. First match wins. | Pure function; all 13 table rows covered |
| T10 | Implement `StateMachine` | Write `orchestrator/StateMachine.ts`. Define the `PhaseTransition[]` table and the `next(current: Phase, state: OnDiskState): Phase` function. Delegates condition evaluation to ReentryResolver for re-entry; uses inline predicates for forward transitions. | Pure function; covers all phase transitions including CASCADE_BLOCKED |
| T11 | Implement `HarnessOrchestrator` — BOOTSTRAP + PHASE_A | Write `orchestrator/HarnessOrchestrator.ts`. Implement constructor, `run()` loop skeleton, `runBootstrap()`, and `runPhaseA()`. Wire FileStateManager, ContextAssembler, IAgentRunner. Verify spec file presence via filesystem check after agent resolves. | run() executes BOOTSTRAP → PHASE_A and halts if no further features |
| T12 | Implement `HarnessOrchestrator` — PHASE_B | Implement `runPhaseB()`. Iterate tasks: for each `NOT_STARTED` task, invoke tdd-orchestrator via IAgentRunner, verify `TDD-OUTPUT.json` presence, mark task COMPLETED. Guard: Phase B does not advance until all tasks COMPLETED. | Full Phase B loop with task iteration |
| T13 | Implement `HarnessOrchestrator` — PHASE_C | Implement `runPhaseC()`. Dispatch both validation agents via IAgentRunner (sequential in this implementation — parallel is a Phase C enhancement). Extract scores via JsonExtractionProtocol. Delegate verdict to ValidationGate. Apply verdict to product files via FileStateManager. | Full Phase C including all four verdict branches |
| T14 | Implement `HarnessOrchestrator` — PHASE_D + PHASE_E | Implement `runPhaseD()` and `runPhaseE()`. Phase D: check completion criteria, determine next action. Phase E: invoke project-memory via IAgentRunner. Wire transitions to HALT or loop back to PHASE_A. | Full loop is end-to-end executable |
| T15 | Implement `src/index.ts` and validate public API | Export `HarnessOrchestrator`, `IAgentRunner`, all public types. Run `tsc --noEmit`. Confirm no type errors. Confirm no internal modules are exported that should remain private. | Clean build with zero TypeScript errors |
