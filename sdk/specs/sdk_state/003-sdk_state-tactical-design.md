# Tactical Design — SDK State (F002)

Domain: `sdk_state`
Feature ID: F002
Source references: `./docs/adr/ARCHITECTURE.md`, `./docs/feature/sdk_core.md`, `001-problem-space.md`, `002-context-map.md`

---

## 1. Architecture Style

F002 extends the existing Ports-and-Adapters (Hexagonal) structure established in F001. No structural change is made to the architecture:

- `IFileStateManager` remains the inbound port.
- `FileStateManager` remains the default adapter.
- Tests inject `FakeFileStateManager` (or a fresh filesystem in integration tests).
- F002 does not introduce any new ports, adapters, or layers.
- All F002 methods follow the same invariants as F001: atomic writes, no caching, no side-channel state.

---

## 2. Module Structure (Delta)

Only the files below change. All other files under `sdk/src/` are untouched by F002.

```
sdk/src/
  file-state/
    types.ts              [CHANGE] Add DecisionEntry interface
    FileStateManager.ts   [CHANGE] Add/rename 7 methods; update appendDecision signature
  index.ts                [CHANGE] Export DecisionEntry; verify all F002 method names are re-exported via IFileStateManager

sdk/tests/
  file-state/
    FileStateManager.test.ts   [CHANGE] Add test cases for all 7 F002 methods (may be new file or extension of existing)
```

No new source files. No new parser files. No new adapter classes.

---

## 3. Type Shapes

### 3.1 New Type: `DecisionEntry` (in `file-state/types.ts`)

```typescript
export interface DecisionEntry {
  featureId: string | null   // null for global decisions (BOOTSTRAP, HALT, etc.)
  decision: string           // required; the decision text
  scores?: { tl: number; adv: number }  // optional; only present when Phase C scores are available
  rationale?: string         // optional; human-readable explanation
}
```

### 3.2 Updated `IFileStateManager` (full interface after F002)

```typescript
export interface IFileStateManager {
  // ─── Bootstrap ──────────────────────────────────────────────────────────
  ensureProductFiles(): void
  loadBootstrapConfig(): BootstrapConfig
  saveBootstrapConfig(config: BootstrapConfig): void

  // ─── Backlog ────────────────────────────────────────────────────────────
  loadBacklog(): Feature[]
  updateFeatureStatus(featureId: string, status: FeatureStatus, scores?: { tl: number; adv: number }): void   // [F002] replaces saveFeatureStatus
  incrementReworks(featureId: string): void                                                                    // [F002] replaces incrementFeatureReworks
  getExecutableFeatures(): Feature[]                                                                           // [F002] new

  // ─── Development State ──────────────────────────────────────────────────
  loadDevelopmentState(): Task[]
  appendTasks(tasks: Task[]): void
  updateTaskStatus(featureId: string, taskId: string, phase: CurrentPhase, status: TaskStatus): void  // [F001 verified]
  updateAllFeatureTasks(featureId: string, phase: CurrentPhase, status: TaskStatus): void
  resetTasksForRetry(featureId: string): void                                                         // [F002] new

  // ─── Decisions log ──────────────────────────────────────────────────────
  appendDecision(entry: DecisionEntry): void      // [F002] signature change from (text: string)
  loadRecentDecisions(n: number): string[]

  // ─── Rework log ─────────────────────────────────────────────────────────
  writeReworkLog(domain: string, content: string): void

  // ─── Queries ────────────────────────────────────────────────────────────
  getNextTask(featureId: string): Task | null    // [F002] new
}
```

**Renames vs. new additions:**

| Method in F002 | Origin | Notes |
|---|---|---|
| `updateFeatureStatus` | Rename of `saveFeatureStatus` | Same write logic; new canonical name. `saveFeatureStatus` removed from interface. |
| `incrementReworks` | Rename of `incrementFeatureReworks` | Same write logic; new canonical name. `incrementFeatureReworks` removed from interface. |
| `appendDecision(entry: DecisionEntry)` | Signature change of `appendDecision(text: string)` | Typing upgrade; formatting moves into BC-2. |
| `resetTasksForRetry` | New | Semantic wrapper over `updateAllFeatureTasks`. |
| `getExecutableFeatures` | New | Pure in-memory query. |
| `getNextTask` | New | Pure in-memory query. |
| `updateTaskStatus` | F001 verified | No change. Documented here as confirmed-complete. |

---

## 4. Method Contracts

### 4.1 `updateFeatureStatus(featureId, status, scores?)`

- **Signature:** `updateFeatureStatus(featureId: string, status: FeatureStatus, scores?: { tl: number; adv: number }): void`
- **Preconditions:** `BACKLOG.md` exists and is readable. A row with `ID === featureId` exists in the table.
- **Postconditions:** The row's `Status` column is set to `status`. If `scores` is provided, `Score (TL)` is set to `scores.tl` and `Score (Adv)` is set to `scores.adv`. All other rows and columns are unchanged. The file is written atomically.
- **Idempotency:** Idempotent. Calling twice with identical arguments produces the same file state after the second call.
- **Error behavior:** Throws `Error('Feature not found: {featureId}')` if no row matches. Does not throw if `scores` is undefined — columns remain at their current values.

### 4.2 `updateTaskStatus(featureId, taskId, phase, status)` — F001 verified

- **Signature:** `updateTaskStatus(featureId: string, taskId: string, phase: CurrentPhase, status: TaskStatus): void`
- **Preconditions:** `DEVELOPMENT-STATE.md` exists and is readable.
- **Postconditions:** The row matching both `featureId` and `taskId` has its `Current Phase` set to `phase` and `Status` set to `status`. All other rows are unchanged. If no matching row exists, the file is rewritten unchanged (silent no-op — known limitation documented in `./docs/feature/sdk_core.md`).
- **Idempotency:** Idempotent. Calling twice with the same arguments produces the same file state.
- **Error behavior:** Does not throw if the task is not found. Does not signal the absence of the row (known limitation from F001).

### 4.3 `appendDecision(entry: DecisionEntry)`

- **Signature:** `appendDecision(entry: DecisionEntry): void`
- **Preconditions:** `DECISIONS.md` exists and is readable. `entry.decision` is a non-empty string.
- **Postconditions:** A new row is appended to `DECISIONS.md` in the format: `| {ISO-timestamp} | {entry.featureId ?? 'GLOBAL'} | {entry.decision} | {scores or '-'} | {entry.rationale ?? '-'} |`. The existing file content is preserved. The file is written atomically. Scores are formatted as `TL:{tl}, Adv:{adv}` when present.
- **Idempotency:** Not idempotent. Each call appends a new row, even if called with identical arguments. This is by design — DECISIONS.md is an audit log.
- **Error behavior:** Does not validate `entry.featureId` format — accepts any string or null. Does not throw on missing optional fields (uses defaults `'-'`).

### 4.4 `incrementReworks(featureId)`

- **Signature:** `incrementReworks(featureId: string): void`
- **Preconditions:** `BACKLOG.md` exists and is readable. A row with `ID === featureId` exists. The `Reworks` cell value is a valid non-negative integer (or empty/zero).
- **Postconditions:** The `Reworks` column for the matching row is incremented by exactly 1. All other rows and columns are unchanged. The file is written atomically.
- **Idempotency:** Not idempotent. Each call increments by 1 regardless of current value. N calls result in Reworks + N.
- **Error behavior:** Throws `Error('Feature not found: {featureId}')` if no row matches. Treats a non-numeric or empty Reworks cell as 0 before incrementing.

### 4.5 `resetTasksForRetry(featureId)`

- **Signature:** `resetTasksForRetry(featureId: string): void`
- **Preconditions:** `DEVELOPMENT-STATE.md` exists and is readable. Zero or more rows with the given `featureId` may exist.
- **Postconditions:** Every row in `DEVELOPMENT-STATE.md` where `Feature ID === featureId` has its `Current Phase` set to `IMPLEMENTATION` and `Status` set to `NOT_STARTED`. Rows for other features are unchanged. The file is written atomically. If no rows match `featureId`, the file is rewritten unchanged (no throw).
- **Idempotency:** Idempotent. Calling twice sets all tasks to `IMPLEMENTATION / NOT_STARTED` both times — the second call produces the same file state as the first.
- **Error behavior:** Does not throw if no tasks exist for the feature.

### 4.6 `getExecutableFeatures()`

- **Signature:** `getExecutableFeatures(): Feature[]`
- **Preconditions:** `BACKLOG.md` exists and is readable by `loadBacklog()`.
- **Postconditions:** Returns all `Feature` objects where `status === 'NOT_STARTED'` AND every ID in `feature.dependencies` belongs to a `Feature` in the loaded backlog with `status === 'COMPLETED'`. An empty `dependencies` array satisfies the condition. No file is written. No state is mutated.
- **Idempotency:** Always idempotent (pure query). Returns a snapshot of current file state.
- **Error behavior:** Returns `[]` if the backlog is empty. Returns `[]` if all features are in terminal or non-NOT_STARTED states. Does not throw on empty or all-terminal backlogs.

### 4.7 `getNextTask(featureId)`

- **Signature:** `getNextTask(featureId: string): Task | null`
- **Preconditions:** `DEVELOPMENT-STATE.md` exists and is readable by `loadDevelopmentState()`.
- **Postconditions:** Returns the first `Task` object in table order (top to bottom as parsed) where `task.featureId === featureId` AND `task.status === 'NOT_STARTED'`. Returns `null` if no such task exists. No file is written. No state is mutated.
- **Idempotency:** Always idempotent (pure query). Returns a snapshot of current file state.
- **Error behavior:** Returns `null` if the feature has no tasks. Returns `null` if all tasks for the feature are in non-NOT_STARTED states. Does not throw.

---

## 5. Idempotency and Atomicity Rules

| Method | Idempotent | Atomic Write | Rule |
|---|---|---|---|
| `updateFeatureStatus` | Yes | Yes | Same args → same Status and Score values in BACKLOG.md; second call overwrites same row with same values |
| `incrementReworks` | No | Yes | Each call increments by 1; N calls with same featureId → Reworks + N |
| `appendDecision` | No | Yes | Each call appends a new row; N calls with same entry → N rows in DECISIONS.md |
| `resetTasksForRetry` | Yes | Yes | All tasks for feature set to IMPLEMENTATION/NOT_STARTED; second call sets same values again — file state identical |
| `updateTaskStatus` | Yes | Yes | Same args → same Phase and Status for the target row; second call overwrites with same values |
| `getExecutableFeatures` | Yes (pure query) | n/a | No writes; returns current in-memory snapshot each call |
| `getNextTask` | Yes (pure query) | n/a | No writes; returns current in-memory snapshot each call |

**Atomic write guarantee:** Every write method uses `atomicWrite(filePath, content)` — writes to `{filePath}.tmp`, then calls `renameSync`. A crash between write and rename leaves `.tmp` orphan; target file is never partially written.

**No caching rule:** Query methods (`getExecutableFeatures`, `getNextTask`) must call their respective load methods (`loadBacklog()`, `loadDevelopmentState()`) on every invocation. They must not store results in instance variables between calls. Stale cache would violate the "persistence is source of truth" invariant.

---

## 6. Implementation Tasks (Ordered)

| Task ID | Description |
| --- | --- |
| T01 | Add `DecisionEntry` interface to `sdk/src/file-state/types.ts` and update `IFileStateManager.appendDecision` signature in `sdk/src/file-state/FileStateManager.ts` from `(text: string)` to `(entry: DecisionEntry)` |
| T02 | Write failing tests for the updated `appendDecision(entry: DecisionEntry)` in `FileStateManager.test.ts`: verify DECISIONS.md row format `\| timestamp \| featureId \| decision \| scores \| rationale \|`, verify null featureId renders as `GLOBAL`, verify scores formatted as `TL:{tl}, Adv:{adv}`, verify missing optional fields render as `-`, verify atomic write (no partial file on crash simulation) |
| T03 | Implement `appendDecision(entry: DecisionEntry)` in `FileStateManager.ts`: format entry as markdown table row, write atomically using `atomicWrite`; make T02 tests pass |
| T04 | Add `updateFeatureStatus` to `IFileStateManager` and write failing tests: verify Status column updated correctly, verify Score (TL) and Score (Adv) columns updated when scores provided, verify Score columns unchanged when scores omitted, verify throws `Error('Feature not found: {id}')` when featureId not found, verify idempotency (call twice with same args → identical file after second call) |
| T05 | Implement `updateFeatureStatus` in `FileStateManager.ts`: delegate to the same write logic as the existing `saveFeatureStatus` implementation; remove `saveFeatureStatus` from `IFileStateManager` (keep implementation private or fold into `updateFeatureStatus`); make T04 tests pass |
| T06 | Add `incrementReworks` to `IFileStateManager` and write failing tests: verify Reworks column incremented by 1 from current value, verify two sequential calls produce Reworks + 2, verify treats empty/non-numeric Reworks cell as 0, verify throws `Error('Feature not found: {id}')` when featureId not found |
| T07 | Implement `incrementReworks` in `FileStateManager.ts`: rename or alias `incrementFeatureReworks` to `incrementReworks`; remove `incrementFeatureReworks` from `IFileStateManager`; make T06 tests pass |
| T08 | Add `resetTasksForRetry` to `IFileStateManager` and write failing tests: verify all tasks for featureId receive `currentPhase: IMPLEMENTATION` and `status: NOT_STARTED`, verify tasks for other features are unchanged, verify idempotency (call twice → same file state after second call), verify no throw and no file change when featureId has zero matching tasks, verify COMPLETED tasks are also reset (all statuses reset unconditionally) |
| T09 | Implement `resetTasksForRetry` in `FileStateManager.ts`: call `this.updateAllFeatureTasks(featureId, 'IMPLEMENTATION', 'NOT_STARTED')`; make T08 tests pass |
| T10 | Add `getExecutableFeatures` to `IFileStateManager` and write failing tests: verify returns only NOT_STARTED features whose every dependency ID maps to a COMPLETED feature, verify feature with one BLOCKED dependency is excluded, verify feature with one IN_PROGRESS dependency is excluded, verify feature with empty dependencies array is included when NOT_STARTED, verify IN_PROGRESS feature with all COMPLETED dependencies is excluded (status check fails), verify empty backlog returns `[]`, verify backlog where all features are terminal returns `[]` |
| T11 | Implement `getExecutableFeatures` in `FileStateManager.ts`: call `this.loadBacklog()`, build a Set of COMPLETED feature IDs, filter the result with the two conditions (`status === 'NOT_STARTED'` and all deps in the COMPLETED set); make T10 tests pass |
| T12 | Add `getNextTask` to `IFileStateManager` and write failing tests: verify returns first NOT_STARTED task for featureId in table order, verify returns `null` when all tasks for featureId are COMPLETED, verify returns `null` when featureId has no tasks at all, verify skips COMPLETED and IN_PROGRESS tasks and returns first NOT_STARTED, verify table order is preserved (first row wins, not alphabetical) |
| T13 | Implement `getNextTask` in `FileStateManager.ts`: call `this.loadDevelopmentState()`, filter by `featureId` and `status === 'NOT_STARTED'`, return `tasks[0] ?? null`; make T12 tests pass |
| T14 | Update `sdk/src/index.ts` to export `DecisionEntry` type; verify `updateFeatureStatus`, `incrementReworks`, `resetTasksForRetry`, `getExecutableFeatures`, and `getNextTask` are accessible through the exported `IFileStateManager` interface; run `tsc --noEmit` and confirm zero TypeScript errors |
