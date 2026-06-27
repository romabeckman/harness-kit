# Problem Space — SDK State (F002)

Domain: `sdk_state`
Feature ID: F002
Source references: `./docs/adr/ARCHITECTURE.md`, `./docs/feature/sdk_core.md`

---

## 1. Big Picture Event Storming

The following events represent every observable action that the state management layer (BC-2: FileStateManager) performs or enables during orchestration. Events are scoped to the file-state domain only — orchestration-level events are documented in F001's problem space.

| # | Domain Event | Trigger / Actor | Resulting State Change |
|---|---|---|---|
| 1 | `BacklogQueried` | OrchestratorCore reads feature list | `BACKLOG.md` parsed in-memory; `Feature[]` returned; no on-disk change |
| 2 | `ExecutableFeaturesQueried` | OrchestratorCore needs to know what can run next (Phase D) | In-memory filter applied over `Feature[]`; features with `status=NOT_STARTED` and all dependencies `COMPLETED` returned; no on-disk change |
| 3 | `FeatureStatusUpdated` | OrchestratorCore calls `updateFeatureStatus` after Phase C verdict | Target feature row in `BACKLOG.md` updated atomically: Status column and optionally Score (TL) + Score (Adv) columns rewritten |
| 4 | `ReworksIncremented` | OrchestratorCore calls `incrementReworks` on RETRY verdict | Reworks column for the target feature row incremented by 1 in `BACKLOG.md`; written atomically |
| 5 | `TasksLoadedForFeature` | OrchestratorCore reads current task list (Phase B) | `DEVELOPMENT-STATE.md` parsed in-memory; `Task[]` returned; no on-disk change |
| 6 | `NextTaskQueried` | OrchestratorCore needs the next unit of work (Phase B) | In-memory scan of `Task[]` for the given feature; first `NOT_STARTED` row returned or null; no on-disk change |
| 7 | `TaskStatusUpdated` | OrchestratorCore calls `updateTaskStatus` during Phase B execution | Target task row in `DEVELOPMENT-STATE.md` updated atomically: Current Phase + Status columns rewritten; all other rows unchanged |
| 8 | `TasksResetForRetry` | OrchestratorCore calls `resetTasksForRetry` on RETRY verdict | All task rows for the given feature in `DEVELOPMENT-STATE.md` set to `currentPhase=IMPLEMENTATION, status=NOT_STARTED`; written atomically |
| 9 | `DecisionAppended` | OrchestratorCore calls `appendDecision` after any state transition | New markdown table row appended to `DECISIONS.md`: columns Timestamp, Feature ID (or GLOBAL), Decision, Scores, Rationale; written atomically |
| 10 | `RecentDecisionsLoaded` | ContextAssembler builds Phase E payload | Last N data rows read from `DECISIONS.md`; returned as `string[]`; no on-disk change |
| 11 | `AllFeatureTasksReset` | OrchestratorCore calls `updateAllFeatureTasks` (internal) | All task rows for a feature bulk-updated to specified phase and status; used internally by `resetTasksForRetry` |

---

## 2. Subdomain Classification

| Subdomain | Type | Rationale |
|---|---|---|
| **File State Management** — F001 base (read/write BACKLOG, DEVELOPMENT-STATE, DECISIONS, BOOTSTRAP-CONFIG) | Core | Established in F001. The persistent medium of truth for all orchestration state. Correctness is non-negotiable. |
| **SDK State Extended Queries** — F002 additions (`getExecutableFeatures`, `getNextTask`) | Core | These query methods encode business rules about which features are eligible to run and what constitutes the next actionable task. The filtering logic (dependency resolution, `NOT_STARTED` precedence) is domain logic, not generic utility. Errors here silently skip work or process the wrong feature. |
| **SDK State Extended Mutations** — F002 additions (`updateFeatureStatus`, `incrementReworks`, `resetTasksForRetry`, typed `appendDecision`) | Core | These mutations enforce the naming contract that HarnessOrchestrator depends on. `incrementReworks` is intentionally non-idempotent; `resetTasksForRetry` is intentionally idempotent. These behavioral guarantees are domain decisions. |

**Why F002 additions remain Core and do not split into a new subdomain:**

F002 adds methods that are semantically distinct but structurally identical to F001 operations — they read the same files, write the same files, and enforce invariants about the same data shapes. There is no new data store, no new I/O layer, and no new conceptual boundary. The additions either:
- Rename existing F001 methods to the canonical names expected by the orchestrator (`updateFeatureStatus` → was `saveFeatureStatus`, `incrementReworks` → was `incrementFeatureReworks`)
- Extend a method signature to accept a typed object (`appendDecision(DecisionEntry)` → was `appendDecision(string)`)
- Add in-memory query methods over data already managed by BC-2 (`getExecutableFeatures`, `getNextTask`)
- Add a semantic convenience wrapper over an existing write method (`resetTasksForRetry` → wraps `updateAllFeatureTasks`)

Splitting these into a separate subdomain would create artificial coupling across a boundary that adds no isolation value.

---

## 3. Ubiquitous Language Glossary

| Term | Definition |
|---|---|
| **ExecutableFeature** | A `Feature` whose `status` is `NOT_STARTED` and whose every entry in `dependencies` is the ID of a `Feature` with `status === 'COMPLETED'`. A feature with an empty `dependencies` array is executable if its own status is `NOT_STARTED`. |
| **NextTask** | The first `Task` in `DEVELOPMENT-STATE.md` table order (top to bottom) where `featureId` matches the requested feature and `status === 'NOT_STARTED'`. Returns null if no such task exists. |
| **DecisionEntry** | A typed object passed to `appendDecision`. Contains: `featureId` (string or null for global decisions), `decision` (required, the decision text), `scores` (optional TL + Adv pair), and `rationale` (optional explanation). The entry is formatted as a markdown table row before being appended to `DECISIONS.md`. |
| **Atomic State Transition** | A write operation where the target file is either fully updated or left completely unchanged. Implemented via write-to-tmp-then-rename. A crash between write and rename leaves a `.tmp` orphan; the target file is never partially written. |
| **Idempotent Mutation** | A write operation that produces the same file state whether called once or N times with the same arguments. `updateFeatureStatus`, `resetTasksForRetry`, and `updateTaskStatus` are idempotent. `incrementReworks` and `appendDecision` are explicitly not idempotent. |
| **resetTasksForRetry** | Sets all tasks belonging to a given feature to `currentPhase: IMPLEMENTATION` and `status: NOT_STARTED`. This is the canonical operation performed when the ValidationGate emits a RETRY verdict. It is idempotent — calling it twice yields the same state as calling it once. |
| **updateFeatureStatus** | The canonical public method for updating a feature's `Status`, `Score (TL)`, and `Score (Adv)` columns in `BACKLOG.md`. This is the name the HarnessOrchestrator calls; it replaces the F001 name `saveFeatureStatus`, which becomes internal. |
| **incrementReworks** | The canonical public method for incrementing the `Reworks` counter for a feature in `BACKLOG.md` by exactly 1. This is the name the HarnessOrchestrator calls; it replaces the F001 name `incrementFeatureReworks`, which becomes internal. |
| **updateTaskStatus** | Updates the `Current Phase` and `Status` columns of a specific task row (matched by `featureId` + `taskId`) in `DEVELOPMENT-STATE.md`. Verified complete in F001; documented here as confirmed. |
| **appendDecision** | Appends a new row to the `DECISIONS.md` audit table. In F002, the signature changes from `(text: string)` to `(entry: DecisionEntry)`. The entry is formatted by the method before writing. |
| **getExecutableFeatures** | Returns the in-memory filtered list of ExecutableFeatures from the current backlog state. Calls `loadBacklog()` internally; performs no additional I/O. |
| **getNextTask** | Returns the first NOT_STARTED task for a given feature from the current development state. Calls `loadDevelopmentState()` internally; performs no additional I/O. |
| **Domain Parameter Guard** | A regex validation applied to any string argument used to construct a filesystem path. Pattern: `^[a-zA-Z0-9_-]+$`. Blocks path traversal attacks. Applied in `writeReworkLog` (F001); must be applied in any F002 method that constructs a path from caller-controlled input. |
| **GLOBAL Decision** | A `DecisionEntry` where `featureId` is `null`. Formatted as `GLOBAL` in the `Feature` column of `DECISIONS.md`. Used for orchestrator-level decisions not tied to a specific feature (e.g., bootstrap decisions, halt decisions). |
| **Canonical Method Name** | The name exposed in `IFileStateManager` and called by `HarnessOrchestrator`. F002 establishes `updateFeatureStatus` and `incrementReworks` as canonical, replacing F001's `saveFeatureStatus` and `incrementFeatureReworks`. |
