# Rework Log — F002 sdk_state

## Rework #1 — 2026-06-26

### Tech Lead Open Points (Score: 0.55 — FAIL)

| Severity | Category | Finding | Question |
| --- | --- | --- | --- |
| HIGH | edge-case | `updateFeatureStatus` and `incrementReworks` compare `cells[0].trim()` directly to `featureId`, but the real BACKLOG.md stores IDs as `**F001**` (bold markdown). Every production mutation call will throw `Feature not found`. | If the real BACKLOG.md stores `**F001**` in the ID column, what does `cells[0].trim()` return, and does that equal the plain string `"F001"` passed by callers? |
| MEDIUM | edge-case | `appendDecision` writes `entry.decision` and `entry.rationale` directly into markdown table cells with no pipe-character escaping. A `\|` in either field produces an extra column, corrupting the row and all subsequent parser reads. | What happens when `rationale` is `"TL: 0.78, score above \| threshold"` — how many columns does that row have when split on `\|`? |
| MEDIUM | edge-case | `getExecutableFeatures` calls `loadBacklog()` which returns features with `id` equal to the raw parsed value (e.g. `**F002**`). Dependency IDs in the Dependencies column are stored as plain `F001`. These never match in the `completedIds` Set, so no feature with dependencies will ever be returned as executable on the real file. | When BacklogParser parses the Dependencies column `"F001"` and the ID column `"**F001**"`, do they both produce the same string for Set membership? |
| LOW | concurrency | `incrementReworks` does read-modify-write without a lock. Two concurrent callers both read `Reworks=0`, both write `Reworks=1`. Final value is 1 instead of 2. | What is the final Reworks value if two processes both read the file before either writes? |
| LOW | edge-case | `updateAllFeatureTasks` (called by `resetTasksForRetry`) calls `readFileSync` without an `existsSync` guard. If DEVELOPMENT-STATE.md was never created, it throws `ENOENT` rather than being a no-op. | What does `resetTasksForRetry("F001")` do if DEVELOPMENT-STATE.md does not exist on disk? |

### Adversarial QA Edge Cases Missed (Score: 0.52 — FAIL)

| Severity | Method | Scenario | Expected Behavior | Actual Behavior |
| --- | --- | --- | --- | --- |
| HIGH | updateFeatureStatus | Called on real BACKLOG.md where featureId cell contains `**F002**` but caller passes plain `"F002"` | Status updated correctly | Throws `Error('Feature not found: F002')` — row is never matched |
| HIGH | appendDecision | `decision` or `rationale` field contains a pipe character `\|` | Pipe escaped or field sanitized; table row has exactly 5 cells | Extra column injected; DECISIONS.md row is malformed; parser silently misreads subsequent rows |
| MEDIUM | getNextTask | DEVELOPMENT-STATE.md rows have bold featureId format `**F001**` as written by real orchestrator | Returns first NOT_STARTED task for F001 | Returns null — `t.featureId === featureId` compares `"**F001**"` to `"F001"` |
| MEDIUM | appendDecision | `featureId` is `undefined` (not `null`) — caller passes `{ featureId: undefined, decision: "..." }` | Renders as `GLOBAL` (same as null) | Renders as the string `"undefined"` — `?? 'GLOBAL'` only catches null/undefined for nullish coalescing but `undefined` IS caught; verify actual output |
| MEDIUM | getExecutableFeatures | Real BACKLOG.md has `**F001**` in ID column and `F001` in Dependencies column | F002 returned as executable when F001 is COMPLETED | Returns [] — completedIds Set contains `"**F001**"` but dep string is `"F001"` |
| LOW | resetTasksForRetry | DEVELOPMENT-STATE.md file does not exist on disk | No-op — returns without throwing | Throws `ENOENT` — readFileSync fails before any match logic runs |
| LOW | incrementReworks | Reworks cell contains whitespace-padded number ` 2 ` after multiple writes | Parses to 2, increments to 3 | Works correctly — parseInt handles whitespace via trim() — verified non-issue |

### Required Fixes for Rework #1

1. **Bold-markdown ID stripping**: Both `updateFeatureStatus` and `incrementReworks` must strip `**` from `cells[0].trim()` before comparing to `featureId` (i.e. `rowId.replace(/\*\*/g, '').trim()`). Same fix needed in `updateAllFeatureTasks` and `updateTaskStatus` for their featureId column.
2. **BacklogParser ID normalization**: `parseCell` in `BacklogParser` must strip `**` and backtick wrappers from the ID cell so `loadBacklog()` returns plain IDs (e.g. `F001` not `**F001**`). This fixes `getExecutableFeatures` and `getNextTask` automatically.
3. **Pipe escaping in `appendDecision`**: Replace `|` with `\|` (or `&#124;`) in `entry.decision` and `entry.rationale` before writing the table row.
4. **`existsSync` guard in `updateAllFeatureTasks`**: Return early if DEVELOPMENT-STATE.md does not exist instead of throwing ENOENT.
5. **Tests must cover bold-format fixtures**: Add at least one test in t16 that writes a BACKLOG.md row with `**F002**` bold ID and verifies `updateFeatureStatus('F002', ...)` succeeds.
6. **Test for pipe injection in `appendDecision`**: Add a test where `decision` contains `|` and verify the written row has exactly 5 pipe-delimited cells.
