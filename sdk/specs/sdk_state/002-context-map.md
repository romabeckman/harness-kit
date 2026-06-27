# Context Map — SDK State (F002)

Domain: `sdk_state`
Feature ID: F002
Source references: `./docs/adr/ARCHITECTURE.md`, `./docs/feature/sdk_core.md`, `001-problem-space.md`

---

## 1. Bounded Contexts

### BC-1: OrchestratorCore (unchanged by F002)

**Responsibility:** Own and drive the state machine. Evaluate transition conditions. Delegate to other contexts through defined interfaces.

**F002 impact on BC-1:**
BC-1 now calls the following F002 methods instead of their F001 counterparts or ad-hoc equivalents:

| Replaced call | F002 canonical call | Occasion |
|---|---|---|
| `saveFeatureStatus(id, status, scores?)` | `updateFeatureStatus(featureId, status, scores?)` | Phase C verdict: PASS, BLOCK, or FAIL |
| `incrementFeatureReworks(id)` | `incrementReworks(featureId)` | Phase C verdict: RETRY |
| `updateAllFeatureTasks(featureId, 'IMPLEMENTATION', 'NOT_STARTED')` | `resetTasksForRetry(featureId)` | Phase C verdict: RETRY |
| `appendDecision(text: string)` | `appendDecision(entry: DecisionEntry)` | Every phase transition and cascade-block event |
| Manual inline filter over `loadBacklog()` | `getExecutableFeatures()` | Phase D — selecting the next feature to run |
| Manual inline filter over `loadDevelopmentState()` | `getNextTask(featureId)` | Phase B — selecting the next task to implement |

BC-1 never calls `saveFeatureStatus` or `incrementFeatureReworks` directly after F002. Those identifiers become internal to BC-2.

---

### BC-2: FileStateManager (extended by F002)

**Responsibility:** Provide a typed, atomic interface for all reads and writes to the four product files. F002 extends this context with higher-level query operations and canonical mutation names.

**F001 baseline responsibilities (unchanged):**
- Atomic read/write of `BACKLOG.md`, `DEVELOPMENT-STATE.md`, `DECISIONS.md`, `BOOTSTRAP-CONFIG.json`
- Markdown table parsing via `BacklogParser`, `DevStateParser`, `BootstrapConfigParser`
- Domain parameter guard on path-constructing methods

**F002 additions to BC-2 responsibilities:**

1. **New query operations — pure in-memory, no new I/O.**
   `getExecutableFeatures()` and `getNextTask(featureId)` call `loadBacklog()` and `loadDevelopmentState()` respectively, then filter in memory. They do not open additional file handles, do not write, and do not cache state between calls.

2. **Typed DecisionEntry replaces raw string in `appendDecision`.**
   BC-2 is now responsible for formatting a `DecisionEntry` object into the `DECISIONS.md` table row format: `| {timestamp} | {featureId ?? 'GLOBAL'} | {decision} | {scores formatted or '-'} | {rationale ?? '-'} |`. Formatting is owned by BC-2, not the caller.

3. **Canonical method names exposed.**
   `updateFeatureStatus` is the public name for what F001 called `saveFeatureStatus`. The implementation logic is unchanged; only the name visible through `IFileStateManager` changes. `saveFeatureStatus` is removed from the interface or made private. Similarly, `incrementReworks` replaces `incrementFeatureReworks` in the interface.

4. **`resetTasksForRetry` as semantic convenience wrapper.**
   BC-2 now provides a single-call operation for the RETRY reset. Internally, it delegates to `updateAllFeatureTasks(featureId, 'IMPLEMENTATION', 'NOT_STARTED')`. The wrapper name encodes the business intent; the underlying write logic is already tested in F001.

**What BC-2 does NOT know (F002 adds no new violations of this):**
- Why a value is being written (receives typed commands, not decisions)
- The state machine phases
- Agent invocations or validation verdicts

---

### BC-3, BC-4, BC-5, BC-6 (unchanged by F002)

No changes to AgentRunnerPort, ValidationGate, ContextAssembler, or JsonExtractionProtocol. F002 is scoped entirely to BC-2 interface extension and BC-1 call-site updates.

---

## 2. Context Map Relationships

All relationships are identical to F001's context map. The following table records the F002 delta in call patterns:

| Relationship | F001 Pattern | F002 Change |
|---|---|---|
| BC-1 → BC-2: feature status write | `saveFeatureStatus(id, status, scores?)` | `updateFeatureStatus(featureId, status, scores?)` — same semantics, canonical name |
| BC-1 → BC-2: reworks increment | `incrementFeatureReworks(id)` | `incrementReworks(featureId)` — same semantics, canonical name |
| BC-1 → BC-2: retry reset | `updateAllFeatureTasks(featureId, 'IMPLEMENTATION', 'NOT_STARTED')` | `resetTasksForRetry(featureId)` — semantic wrapper, same underlying write |
| BC-1 → BC-2: decision log | `appendDecision(text: string)` | `appendDecision(entry: DecisionEntry)` — typed object; BC-2 owns formatting |
| BC-1 → BC-2: Phase D feature selection | Inline filter over `loadBacklog()` result | `getExecutableFeatures()` — encapsulates dependency-resolution filter inside BC-2 |
| BC-1 → BC-2: Phase B task selection | Inline filter over `loadDevelopmentState()` result | `getNextTask(featureId)` — encapsulates first-NOT_STARTED filter inside BC-2 |
| BC-5 → BC-2: Phase E payload | `loadRecentDecisions(n)` — unchanged | No change |

The integration pattern (Shared Kernel for BC-1 ↔ BC-2) is unchanged. The shared contract is `IFileStateManager`.

---

## 3. ASCII Context Map Diagram

F002-added call sites are marked with `[F002]`.

```
┌────────────────────────────────────────────────────────────────────┐
│                         BC-1: OrchestratorCore                     │
│                         HarnessOrchestrator                        │
│                                                                    │
│  Phase D  ──── getExecutableFeatures()            [F002]           │
│  Phase B  ──── getNextTask(featureId)             [F002]           │
│  Phase B  ──── updateTaskStatus(fId, tId, ph, st) [F001 verified]  │
│  Phase C  ──── updateFeatureStatus(fId, st, sc?)  [F002]           │
│  Phase C  ──── incrementReworks(featureId)        [F002]           │
│  Phase C  ──── resetTasksForRetry(featureId)      [F002]           │
│  All      ──── appendDecision(DecisionEntry)      [F002]           │
│  Phase E  ──── loadRecentDecisions(n)             [F001]           │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ IFileStateManager (Shared Kernel)
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│                       BC-2: FileStateManager                       │
│                                                                    │
│  READS (in-memory query, no new I/O)                               │
│    getExecutableFeatures()    → loadBacklog() + filter  [F002]     │
│    getNextTask(featureId)     → loadDevelopmentState() + filter    │
│                                                          [F002]    │
│                                                                    │
│  WRITES (atomic, write-to-tmp-then-rename)                         │
│    updateFeatureStatus()      → BACKLOG.md              [F002]     │
│    incrementReworks()         → BACKLOG.md              [F002]     │
│    resetTasksForRetry()       → DEVELOPMENT-STATE.md   [F002]     │
│    appendDecision(entry)      → DECISIONS.md (table row)[F002]     │
│    updateTaskStatus()         → DEVELOPMENT-STATE.md   [F001]      │
│    appendTasks()              → DEVELOPMENT-STATE.md   [F001]      │
│    saveBootstrapConfig()      → BOOTSTRAP-CONFIG.json  [F001]      │
│                                                                    │
│  INTERNAL (not on IFileStateManager after F002)                    │
│    saveFeatureStatus()        → renamed to updateFeatureStatus()   │
│    incrementFeatureReworks()  → renamed to incrementReworks()      │
│    updateAllFeatureTasks()    → called by resetTasksForRetry()     │
│                               → still on interface for direct use  │
└────────────────────────────────────────────────────────────────────┘
         │ reads from
         ▼
┌────────────────────────────────────────────────────────────────────┐
│  Product Files (BACKLOG.md, DEVELOPMENT-STATE.md,                  │
│                 DECISIONS.md, BOOTSTRAP-CONFIG.json)               │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Boundary Rules

The following rules govern F002. Rules 1–5 are inherited from F001. Rules 6–10 are new F002-specific additions.

**Inherited (F001):**

1. No context reads the filesystem directly except FileStateManager. All file operations flow through `IFileStateManager`.
2. No context instantiates a concrete agent runner. Only `IAgentRunner` is referenced inside the SDK.
3. ValidationGate is a pure function context. It receives all inputs as arguments; it performs no I/O, no side effects.
4. OrchestratorCore is the only context that owns phase transitions.
5. ContextAssembler never decides what to run. Payload assembly is triggered by OrchestratorCore.

**F002 additions:**

6. `HarnessOrchestrator` must call `updateFeatureStatus` (not `saveFeatureStatus`) for all feature status writes. `saveFeatureStatus` must not appear in any orchestrator call site after F002 is merged.

7. `HarnessOrchestrator` must call `incrementReworks` (not `incrementFeatureReworks`) for all rework counter increments. `incrementFeatureReworks` must not appear in any orchestrator call site after F002 is merged.

8. `HarnessOrchestrator` must call `resetTasksForRetry` (not `updateAllFeatureTasks` with hardcoded args) when processing a RETRY verdict. The intent-encoding wrapper is mandatory to keep orchestrator code readable.

9. `HarnessOrchestrator` must pass a `DecisionEntry` object to `appendDecision`. Raw string calls to `appendDecision` are a type error after F002. The orchestrator is responsible for populating `featureId`, `decision`, and optionally `scores` and `rationale`. BC-2 is responsible for formatting.

10. `getExecutableFeatures` and `getNextTask` must not perform additional I/O beyond the single `loadBacklog()` or `loadDevelopmentState()` call they make internally. They must not cache results between calls. Each call reads the current file state.
