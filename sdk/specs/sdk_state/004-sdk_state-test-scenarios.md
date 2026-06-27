# Test Scenarios — SDK State (F002)

Domain: `sdk_state`
Feature ID: F002
Source references: `./docs/adr/ARCHITECTURE.md`, `./docs/feature/sdk_core.md`, `003-sdk_state-tactical-design.md`

All scenarios use a real temporary directory with actual filesystem writes. No mocks of `fs`. Tests verify file content after each operation by reading the written file.

---

## 1. `updateFeatureStatus`

### 1.1 Happy Path — status updated with scores

| Scenario | Given | When | Then |
|---|---|---|---|
| Status and scores written to correct row | BACKLOG.md has row: `\| F001 \| Feature One \| core \| 1 \| - \| 0 \| - \| - \| NOT_STARTED \|` | `updateFeatureStatus('F001', 'COMPLETED', { tl: 0.85, adv: 0.90 })` | Row becomes `\| F001 \| Feature One \| core \| 1 \| - \| 0 \| 0.85 \| 0.90 \| COMPLETED \|`; all other rows unchanged |

### 1.2 Happy Path — status updated without scores

| Scenario | Given | When | Then |
|---|---|---|---|
| Status updated, score columns preserved | BACKLOG.md has row with existing scores `0.75` and `0.80` | `updateFeatureStatus('F001', 'FAILED')` (no scores arg) | Status column is `FAILED`; Score (TL) remains `0.75`; Score (Adv) remains `0.80` |

### 1.3 Not Found — throws

| Scenario | Given | When | Then |
|---|---|---|---|
| Feature ID not in backlog | BACKLOG.md has only row for `F001` | `updateFeatureStatus('F999', 'COMPLETED')` | Throws `Error` with message containing `'F999'`; BACKLOG.md file content unchanged |

### 1.4 Idempotency — second call produces identical file

| Scenario | Given | When | Then |
|---|---|---|---|
| Calling twice with same args leaves file unchanged on second call | BACKLOG.md has row for `F001` with `NOT_STARTED` | Call `updateFeatureStatus('F001', 'COMPLETED', { tl: 0.9, adv: 0.8 })` twice | File content after second call is byte-for-byte identical to file content after first call |

---

## 2. `updateTaskStatus` (F001 verified — existing behavior documented)

### 2.1 Happy Path — correct row updated, others unchanged

| Scenario | Given | When | Then |
|---|---|---|---|
| Target task row updated, other rows intact | DEVELOPMENT-STATE.md has tasks for F001/T01, F001/T02, F002/T01 | `updateTaskStatus('F001', 'T01', 'VALIDATION', 'IN_PROGRESS')` | Row `F001/T01` has `Current Phase = VALIDATION`, `Status = IN_PROGRESS`; rows `F001/T02` and `F002/T01` unchanged |

### 2.2 Task not found — silent no-op (existing behavior)

| Scenario | Given | When | Then |
|---|---|---|---|
| Non-existent task produces no change and no throw | DEVELOPMENT-STATE.md has only `F001/T01` | `updateTaskStatus('F001', 'T99', 'IMPLEMENTATION', 'COMPLETED')` | Method returns without throwing; DEVELOPMENT-STATE.md content unchanged; no error signal |

### 2.3 Idempotency — second call produces identical file

| Scenario | Given | When | Then |
|---|---|---|---|
| Same update applied twice leaves file unchanged on second call | DEVELOPMENT-STATE.md has `F001/T01` with `IMPLEMENTATION / NOT_STARTED` | Call `updateTaskStatus('F001', 'T01', 'VALIDATION', 'COMPLETED')` twice | File content after second call is byte-for-byte identical to file content after first call |

---

## 3. `appendDecision(DecisionEntry)`

### 3.1 Happy Path — row appended with featureId

| Scenario | Given | When | Then |
|---|---|---|---|
| Row appended with feature-scoped entry | DECISIONS.md has header row and one existing data row | `appendDecision({ featureId: 'F001', decision: 'Proceed to Phase B', scores: { tl: 0.85, adv: 0.90 }, rationale: 'Both scores above threshold' })` | New row appended: `\| {ISO-timestamp} \| F001 \| Proceed to Phase B \| TL:0.85, Adv:0.90 \| Both scores above threshold \|`; existing rows preserved |

### 3.2 Happy Path — null featureId renders as GLOBAL

| Scenario | Given | When | Then |
|---|---|---|---|
| GLOBAL decision appended | DECISIONS.md is empty (header only) | `appendDecision({ featureId: null, decision: 'Halting — no executable features remain' })` | New row has `GLOBAL` in the Feature column |

### 3.3 With scores — scores formatted as `TL:{tl}, Adv:{adv}`

| Scenario | Given | When | Then |
|---|---|---|---|
| Scores formatted correctly | Any valid DECISIONS.md | `appendDecision({ featureId: 'F002', decision: 'Rework triggered', scores: { tl: 0.60, adv: 0.55 } })` | Scores column contains exactly `TL:0.60, Adv:0.55` |

### 3.4 Without scores — scores column shows `-`

| Scenario | Given | When | Then |
|---|---|---|---|
| No scores defaults to dash | Any valid DECISIONS.md | `appendDecision({ featureId: 'F002', decision: 'Feature blocked — dependency cycle' })` (no scores, no rationale) | Scores column contains `-`; Rationale column contains `-` |

### 3.5 Without rationale — rationale column shows `-`

| Scenario | Given | When | Then |
|---|---|---|---|
| No rationale defaults to dash | Any valid DECISIONS.md | `appendDecision({ featureId: 'F001', decision: 'Completed', scores: { tl: 0.9, adv: 0.85 } })` (no rationale) | Rationale column contains `-`; Scores column contains `TL:0.9, Adv:0.85` |

### 3.6 Multiple calls — each appended as separate row (non-idempotent)

| Scenario | Given | When | Then |
|---|---|---|---|
| Three calls produce three rows | DECISIONS.md has header only | Call `appendDecision(...)` three times with different decisions | DECISIONS.md has exactly 3 data rows (excluding header and separator rows); rows appear in call order |

---

## 4. `incrementReworks`

### 4.1 Happy Path — Reworks incremented from 0 to 1

| Scenario | Given | When | Then |
|---|---|---|---|
| Zero reworks incremented to one | BACKLOG.md has row for `F001` with `Reworks = 0` | `incrementReworks('F001')` | Reworks column for `F001` is `1`; all other columns unchanged; other rows unchanged |

### 4.2 Multiple increments — calling N times → Reworks = N

| Scenario | Given | When | Then |
|---|---|---|---|
| Three calls produce Reworks = 3 | BACKLOG.md has row for `F001` with `Reworks = 0` | Call `incrementReworks('F001')` three times | Reworks column is `3` |

### 4.3 Starts at non-zero — increments correctly

| Scenario | Given | When | Then |
|---|---|---|---|
| Reworks already at 2, incremented to 3 | BACKLOG.md has row for `F001` with `Reworks = 2` | `incrementReworks('F001')` | Reworks column is `3` |

### 4.4 Not found — throws

| Scenario | Given | When | Then |
|---|---|---|---|
| Feature not in backlog throws | BACKLOG.md has only `F001` | `incrementReworks('F999')` | Throws `Error` with message containing `'F999'`; BACKLOG.md unchanged |

### 4.5 Non-numeric Reworks cell — treated as 0

| Scenario | Given | When | Then |
|---|---|---|---|
| Empty or dash Reworks cell treated as 0 | BACKLOG.md has row for `F001` with Reworks cell value `-` | `incrementReworks('F001')` | Reworks column is `1` (treated as 0 + 1) |

---

## 5. `resetTasksForRetry`

### 5.1 Happy Path — all tasks for feature reset

| Scenario | Given | When | Then |
|---|---|---|---|
| All tasks for feature set to IMPLEMENTATION/NOT_STARTED | DEVELOPMENT-STATE.md has three tasks for `F001` (one COMPLETED, one IN_PROGRESS, one NOT_STARTED) and one task for `F002` | `resetTasksForRetry('F001')` | All three `F001` tasks have `Current Phase = IMPLEMENTATION` and `Status = NOT_STARTED`; `F002` task unchanged |

### 5.2 No tasks for feature — no throw, file unchanged

| Scenario | Given | When | Then |
|---|---|---|---|
| No matching tasks produces no error | DEVELOPMENT-STATE.md has tasks only for `F001` | `resetTasksForRetry('F999')` | Method returns without throwing; DEVELOPMENT-STATE.md content unchanged |

### 5.3 Idempotency — call twice produces same result

| Scenario | Given | When | Then |
|---|---|---|---|
| Second call leaves file identical to first call result | DEVELOPMENT-STATE.md has two tasks for `F001` with COMPLETED status | Call `resetTasksForRetry('F001')` twice | File content after second call is byte-for-byte identical to file content after first call; both tasks show IMPLEMENTATION/NOT_STARTED |

### 5.4 Mixed statuses — ALL reset unconditionally

| Scenario | Given | When | Then |
|---|---|---|---|
| COMPLETED, FAILED, BLOCKED tasks all reset | DEVELOPMENT-STATE.md has tasks for `F001` with statuses: COMPLETED, FAILED, BLOCKED, IN_PROGRESS | `resetTasksForRetry('F001')` | All four tasks show `IMPLEMENTATION` and `NOT_STARTED` regardless of prior status |

---

## 6. `getExecutableFeatures`

### 6.1 All dependencies COMPLETED — feature included

| Scenario | Given | When | Then |
|---|---|---|---|
| Feature with one COMPLETED dependency is executable | BACKLOG.md: `F001 COMPLETED`, `F002 NOT_STARTED dependencies=F001` | `getExecutableFeatures()` | Returns `[F002]` |

### 6.2 One dependency BLOCKED — feature excluded

| Scenario | Given | When | Then |
|---|---|---|---|
| Feature with a BLOCKED dependency is not executable | BACKLOG.md: `F001 BLOCKED`, `F002 NOT_STARTED dependencies=F001` | `getExecutableFeatures()` | Returns `[]` |

### 6.3 One dependency IN_PROGRESS — feature excluded

| Scenario | Given | When | Then |
|---|---|---|---|
| Feature with an IN_PROGRESS dependency is not executable | BACKLOG.md: `F001 IN_PROGRESS`, `F002 NOT_STARTED dependencies=F001` | `getExecutableFeatures()` | Returns `[]` |

### 6.4 No dependencies — feature included when NOT_STARTED

| Scenario | Given | When | Then |
|---|---|---|---|
| Feature with empty dependencies array and NOT_STARTED status is executable | BACKLOG.md: `F001 NOT_STARTED dependencies=[]` | `getExecutableFeatures()` | Returns `[F001]` |

### 6.5 Feature is IN_PROGRESS — excluded even if dependencies met

| Scenario | Given | When | Then |
|---|---|---|---|
| Feature already in progress is not re-queued | BACKLOG.md: `F001 COMPLETED`, `F002 IN_PROGRESS dependencies=F001` | `getExecutableFeatures()` | Returns `[]` (F002 status is not NOT_STARTED) |

### 6.6 Empty backlog — returns empty array

| Scenario | Given | When | Then |
|---|---|---|---|
| No features returns empty | BACKLOG.md has header rows only | `getExecutableFeatures()` | Returns `[]` without throwing |

### 6.7 All features terminal — returns empty array

| Scenario | Given | When | Then |
|---|---|---|---|
| COMPLETED, BLOCKED, FAILED features return empty | BACKLOG.md has `F001 COMPLETED`, `F002 BLOCKED`, `F003 FAILED` | `getExecutableFeatures()` | Returns `[]` |

### 6.8 Multiple executable features — all returned

| Scenario | Given | When | Then |
|---|---|---|---|
| Two independent NOT_STARTED features both returned | BACKLOG.md has `F001 NOT_STARTED dependencies=[]` and `F002 NOT_STARTED dependencies=[]` | `getExecutableFeatures()` | Returns array containing both `F001` and `F002`; order matches table order |

### 6.9 Dependency referenced but not in backlog — feature excluded

| Scenario | Given | When | Then |
|---|---|---|---|
| Dependency ID that does not exist in backlog is treated as not COMPLETED | BACKLOG.md has `F002 NOT_STARTED dependencies=F001`; no `F001` row | `getExecutableFeatures()` | Returns `[]` (F001 is not in the COMPLETED set because it does not exist) |

---

## 7. `getNextTask`

### 7.1 Multiple NOT_STARTED tasks — returns first in table order

| Scenario | Given | When | Then |
|---|---|---|---|
| First NOT_STARTED task returned | DEVELOPMENT-STATE.md has `F001/T01 NOT_STARTED`, `F001/T02 NOT_STARTED` | `getNextTask('F001')` | Returns `Task` with `taskId === 'T01'` |

### 7.2 All tasks COMPLETED — returns null

| Scenario | Given | When | Then |
|---|---|---|---|
| No NOT_STARTED tasks returns null | DEVELOPMENT-STATE.md has `F001/T01 COMPLETED`, `F001/T02 COMPLETED` | `getNextTask('F001')` | Returns `null` |

### 7.3 No tasks for featureId — returns null

| Scenario | Given | When | Then |
|---|---|---|---|
| Feature with no tasks returns null | DEVELOPMENT-STATE.md has tasks for `F002` only | `getNextTask('F001')` | Returns `null` without throwing |

### 7.4 Mixed statuses — skips non-NOT_STARTED, returns first NOT_STARTED

| Scenario | Given | When | Then |
|---|---|---|---|
| COMPLETED and IN_PROGRESS tasks skipped | DEVELOPMENT-STATE.md: `F001/T01 COMPLETED`, `F001/T02 IN_PROGRESS`, `F001/T03 NOT_STARTED` | `getNextTask('F001')` | Returns `Task` with `taskId === 'T03'` |

### 7.5 Table order preserved — not alphabetical

| Scenario | Given | When | Then |
|---|---|---|---|
| Row order in file determines which task is "first" | DEVELOPMENT-STATE.md: `F001/T10 NOT_STARTED` appears before `F001/T02 NOT_STARTED` in the file | `getNextTask('F001')` | Returns `Task` with `taskId === 'T10'` (first row wins, not alphabetical sort) |

### 7.6 Tasks for other features ignored

| Scenario | Given | When | Then |
|---|---|---|---|
| Tasks for F002 do not affect result for F001 | DEVELOPMENT-STATE.md: `F002/T01 NOT_STARTED`, `F001/T01 COMPLETED` | `getNextTask('F001')` | Returns `null` (F001 has no NOT_STARTED tasks; F002 tasks are ignored) |
