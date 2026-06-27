# Context Map — SDK Core (F001)

Domain: `sdk_core`
Source of truth: `001-problem-space.md`

---

## 1. Bounded Contexts

### BC-1: OrchestratorCore

**Responsibility:** Own and drive the state machine. Evaluate transition conditions. Delegate to other contexts through defined interfaces. Log every state change before executing the next action.

**What it knows:**
- The ordered list of phases and their transitions (BOOTSTRAP → PHASE_A → PHASE_B → PHASE_C → PHASE_D → PHASE_E)
- The active feature and its current phase
- The verdict rules (PASS / RETRY / BLOCK / FAIL thresholds)
- The re-entry algorithm (scan State Transition Table, enter at first matching condition)

**What it does NOT know:**
- How files are read or written (delegates to FileStateManager)
- How agents are invoked (delegates to AgentRunnerPort)
- How validation scores are computed (delegates to ValidationGate for verdict; scores come from AgentRunnerPort)
- How context payloads are assembled (delegates to ContextAssembler)

**Aggregate root:** `HarnessOrchestrator`

**Key domain events emitted:** `OrchestratorInitialized`, `PhaseTransitioned`, `LoopHalted`, `CascadeBlocked`, `LoopAdvanced`

---

### BC-2: FileStateManager

**Responsibility:** Provide a typed, atomic interface for all reads and writes to the four product files. Guarantee that callers never touch the filesystem directly. Enforce the "persistence first" rule — every state change must be persisted before the next action executes.

**What it knows:**
- The schema of each product file (`BACKLOG.md` row structure, `DEVELOPMENT-STATE.md` row structure, `DECISIONS.md` append-only log, `BOOTSTRAP-CONFIG.json` shape)
- The filesystem paths to each product file (derived from the `projectPaths` config)
- Markdown table parsing and serialization

**What it does NOT know:**
- Why a value is being written (it receives typed update commands, not decisions)
- The state machine phases
- Agent invocations

**Key operations:**
- `loadBacklog(): Feature[]`
- `saveFeatureStatus(id, status, scores?): void`
- `loadBootstrapConfig(): BootstrapConfig`
- `appendDecision(text): void`
- `loadDevelopmentState(): Task[]`
- `appendTasks(tasks: Task[]): void`
- `updateTaskStatus(taskId, phase, status): void`
- `writeReworkLog(domain, content): void`

**Key domain events emitted:** `BacklogLoaded`, `BootstrapFilesEnsured`, `MemoryPersisted`

---

### BC-3: AgentRunnerPort

**Responsibility:** Define the outbound port contract for all agent/skill invocations. This context is a stub — the interface is specified here, the implementation is F003. The orchestrator depends on this interface only; it never depends on a concrete runner.

**What it knows:**
- The invocation signature: skill name, agent name, mode, and context payload
- The resolution contract: a structured `AgentOutput` containing raw text and optional parsed artefacts

**What it does NOT know:**
- How agents are launched (CLI, API, subprocess — F003's concern)
- The content of context payloads (assembled by ContextAssembler, passed through)
- Retry transport logic

**Key interface:**

```typescript
interface IAgentRunner {
  run(invocation: AgentInvocation): Promise<AgentOutput>
}

interface AgentInvocation {
  skill: string
  agent: string
  mode: 'autonomous'
  payload: ContextPayload
}

interface AgentOutput {
  raw: string
  artefacts?: Record<string, string>
}
```

**Key domain events emitted:** `AgentInvoked`, `AgentOutputReceived`

---

### BC-4: ValidationGate

**Responsibility:** Evaluate validation scores against configured thresholds and emit a typed verdict. This context owns all verdict rules from Phase C of the SKILL.md. It takes scores and rework counts as inputs and returns a deterministic verdict with a rationale.

**What it knows:**
- The four verdict rules: PASS, RETRY, BLOCK, FAIL (exact conditions from SKILL.md Phase C5)
- Score threshold values (loaded from `BootstrapConfig` via FileStateManager)
- Whether a feature has exhausted its rework budget (`Reworks >= maxReworks`)
- Whether a failure causes a crash vs. is a continuable defect

**What it does NOT know:**
- How scores were generated (that is AgentRunnerPort's output)
- How to persist the verdict (that is FileStateManager's job)
- The state machine phases

**Key operations:**
- `evaluate(scores: ValidationScores, reworks: number, config: BootstrapConfig, isCrashing: boolean): VerdictResult`

**Key domain events emitted:** `ValidationGateEvaluated`, `FeatureCompleted`, `FeatureBlocked`, `FeatureFailed`, `ReworkInitiated`

---

### BC-5: ContextAssembler (Supporting)

**Responsibility:** Construct minimal, token-optimized `ContextPayload` objects for each phase's agent invocation. Each phase requires different information — this context knows which files and values to include per phase without passing the entire product file set.

**What it knows:**
- Which fields from `Feature`, `Task[]`, `BootstrapConfig`, and `docs/specs/{domain}/` paths are needed per phase
- The token-optimization contract: only include what the receiving agent needs

**What it does NOT know:**
- The state machine logic
- How to read files (requests values from FileStateManager)

**Key operations:**
- `buildPhaseAPayload(feature: Feature, projectPaths: string[]): ContextPayload`
- `buildPhaseBPayload(feature: Feature, tasks: Task[], projectPaths: string[], isRetry: boolean): ContextPayload`
- `buildPhaseCPayload(feature: Feature, projectPaths: string[]): ContextPayload`
- `buildPhaseEPayload(feature: Feature, completedCycles: number, decisions: string[]): ContextPayload`

---

### BC-6: JsonExtractionProtocol (Generic)

**Responsibility:** Defensively parse agent output strings to extract JSON metrics (scores, paths). Follows the exact four-step protocol defined in SKILL.md Section 3. No domain knowledge — pure string processing utility.

**Key operation:**
- `extract(raw: string): Record<string, unknown> | ExtractionError`

---

## 2. Context Map Relationships

```
                        ┌───────────────────────────────┐
                        │       OrchestratorCore         │  ← BC-1 (Core)
                        │  HarnessOrchestrator           │
                        │  State Machine + Loop Driver   │
                        └───┬───────┬───────┬────────────┘
                            │       │       │
              ┌─────────────┘       │       └──────────────┐
              ▼                     ▼                       ▼
   ┌──────────────────┐  ┌──────────────────┐   ┌──────────────────┐
   │  FileStateManager│  │  AgentRunnerPort  │   │  ValidationGate  │
   │  BC-2 (Core)     │  │  BC-3 (Supporting)│   │  BC-4 (Core)     │
   │  Product files   │  │  IAgentRunner stub│   │  Verdict rules   │
   └──────────────────┘  └────────┬─────────┘   └──────────────────┘
                                  │
                         ┌────────▼─────────┐
                         │  ContextAssembler │  ← BC-5 (Supporting)
                         │  Minimal payloads │
                         └──────────────────┘
                                  │
                         ┌────────▼─────────┐
                         │ JsonExtraction    │  ← BC-6 (Generic)
                         │ Protocol          │
                         └──────────────────┘
```

---

## 3. Integration Patterns

| Relationship | Pattern | Rationale |
|---|---|---|
| OrchestratorCore → FileStateManager | **Shared Kernel** (typed interfaces) | Both are Core subdomains. The file schema is a shared contract — changes to file structure affect both. The interface layer prevents direct coupling to markdown internals. |
| OrchestratorCore → AgentRunnerPort | **Open Host Service / Published Language** | OrchestratorCore defines the `IAgentRunner` interface (Published Language). F003 implements it as an Adapter. The Orchestrator never changes when the runner implementation changes. |
| OrchestratorCore → ValidationGate | **Shared Kernel** | Both are Core. The verdict rules are domain logic that the Orchestrator trusts completely. ValidationGate is a pure function context — no side effects, no I/O. |
| OrchestratorCore → ContextAssembler | **Customer / Supplier** | OrchestratorCore (Customer) tells ContextAssembler what phase is active. ContextAssembler (Supplier) determines what context to package. The Orchestrator does not know payload structure. |
| AgentRunnerPort → JsonExtractionProtocol | **Conformist** | The output parsing must strictly conform to the SKILL.md protocol — no deviation. JsonExtractionProtocol is a utility the runner port (or the Orchestrator) calls post-invocation. |
| FileStateManager → ContextAssembler | **Customer / Supplier** | ContextAssembler requests specific field values from FileStateManager to assemble payloads. ContextAssembler depends on FileStateManager's read operations. |

---

## 4. Boundary Rules

- **No context reads the filesystem directly** except FileStateManager. All file operations flow through it.
- **No context instantiates a concrete agent runner.** Only `IAgentRunner` is referenced inside the SDK. F003 registers an implementation at construction time (dependency injection).
- **ValidationGate is a pure function context.** It receives all inputs as arguments; it performs no I/O, no side effects.
- **OrchestratorCore is the only context that owns phase transitions.** No other context may alter `currentPhase` or emit `PhaseTransitioned`.
- **ContextAssembler never decides what to run.** It assembles payloads when told. Decision of which agent to invoke belongs to OrchestratorCore.
