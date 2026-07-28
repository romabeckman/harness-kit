# sdk_state — FileStateManager High-Level Mutations

The `sdk_state` module extends `FileStateManager` with seven high-level state mutation and query methods that the orchestrator loop requires beyond the foundation established in F001.

## OVERVIEW

F002 adds write methods (`updateFeatureStatus`, `incrementReworks`, `appendDecision`, `resetTasksForRetry`) and pure query methods (`getExecutableFeatures`, `getNextTask`) to the existing `FileStateManager` adapter. All methods operate on the same markdown/JSON files introduced in F001 and follow identical atomicity and no-cache invariants. No new source files, ports, or adapters are introduced.

## FOLDER STRUCTURE

<folder_structure>
sdk/src/file-state/
├── FileStateManager.ts     # Hosts all 7 new methods; saveFeatureStatus/incrementFeatureReworks removed
├── types.ts                # Added DecisionEntry interface
└── parsers/
    ├── BacklogParser.ts    # normalizeId() strips bold-markdown (**) and backtick wrapping from IDs
    └── DevStateParser.ts   # normalizeId() strips bold-markdown (**) and backtick wrapping from IDs

sdk/tests/integration/
└── t16-file-state-f002.test.ts  # 43 integration tests covering all 7 new methods plus rework fixes
</folder_structure>

## PUBLIC API ADDITIONS (IFileStateManager)

### Renamed / Signature-Changed Methods

| Method | Change | Notes |
|---|---|---|
| `updateFeatureStatus(featureId, status, scores?)` | Renames `saveFeatureStatus` | Writes Status, Score (TL), Score (Adv) columns atomically |
| `incrementReworks(featureId)` | Renames `incrementFeatureReworks` | Treats empty/non-numeric cell as 0 before incrementing |
| `appendDecision(entry: DecisionEntry)` | Signature change from `(text: string)` | Formats entry as markdown table row with pipe-escaped fields |

### New Methods

| Method | Kind | Notes |
|---|---|---|
| `resetTasksForRetry(featureId)` | Write | Semantic wrapper over `updateAllFeatureTasks(featureId, 'IMPLEMENTATION', 'NOT_STARTED')` |
| `getExecutableFeatures()` | Pure query | Returns NOT_STARTED features whose every dependency ID maps to a COMPLETED feature |
| `getNextTask(featureId)` | Pure query | Returns first NOT_STARTED task for featureId in table order, or null |

### New Type: DecisionEntry

```typescript
export interface DecisionEntry {
  featureId: string | null   // null renders as 'GLOBAL' in DECISIONS.md
  decision: string           // required; pipe characters escaped as &#124;
  scores?: { tl: number; adv: number }  // formatted as 'TL:{tl}, Adv:{adv}' or '-'
  rationale?: string         // optional; defaults to '-'
}
```

## IDEMPOTENCY AND ATOMICITY CONTRACT

| Method | Idempotent | Atomic Write |
|---|---|---|
| `updateFeatureStatus` | Yes | Yes |
| `incrementReworks` | No — each call adds 1 | Yes |
| `appendDecision` | No — each call appends a new row | Yes |
| `resetTasksForRetry` | Yes | Yes |
| `getExecutableFeatures` | Yes (pure query, no write) | n/a |
| `getNextTask` | Yes (pure query, no write) | n/a |

Query methods call their respective load methods (`loadBacklog`, `loadDevelopmentState`) on every invocation. No results are cached in instance variables.

## REWORK #2 FIXES

Two formatting defects identified in Phase C validation and corrected in Rework #2:

**writeReworkLog markdown formatting** — When `content` contains semicolon-separated items (as produced by `ValidationGate.buildFailureReasons`), `writeReworkLog` now splits on `;` and renders each item as a markdown list entry (`- item`). Content without semicolons is written as-is.

**appendDecision rationale truncation** — `rationale` values longer than 200 characters are now truncated to 200 characters with a trailing `...`. Short rationales are written intact. Prevents table rows from becoming unreadably wide in `DECISIONS.md`.

## REWORK #1 FIXES

Three defects were identified in Phase C validation and corrected in Rework #1:

**Bold-markdown ID stripping** — Real `BACKLOG.md` and `DEVELOPMENT-STATE.md` rows write IDs as `**F001**`. `BacklogParser.normalizeId()` and `DevStateParser.normalizeId()` both strip `**` and backticks before returning the ID, so mutation methods never raise `Feature not found` against production files.

**Pipe escaping in appendDecision** — `decision` and `rationale` fields replace `|` with `&#124;` before insertion to prevent markdown table corruption in `DECISIONS.md`.

**existsSync guard in updateAllFeatureTasks** — `updateAllFeatureTasks` (and therefore `resetTasksForRetry`) returns early without error when `DEVELOPMENT-STATE.md` does not exist, satisfying the no-throw contract when no tasks are present.

## KNOWN LIMITATIONS (INHERITED FROM F001)

The following limitations documented in `sdk_core` remain unresolved:

1. `updateTaskStatus` silent no-op — no signal when featureId + taskId pair is not found.
2. `loadRecentDecisions` / `appendDecision` format mismatch — raw table rows returned by `loadRecentDecisions` may not match the caller's expected structure.
3. `persistPhase` silent catch — phase write failures are swallowed.

## BEST PRACTICES

REQUIRED: Call `resetTasksForRetry(featureId)` before re-entering DEVELOPMENT — ensures all tasks are at `IMPLEMENTATION / NOT_STARTED` before the developer agent reads them.

REQUIRED: Pass `DecisionEntry` with `featureId` set to the active feature ID so the audit trail in `DECISIONS.md` remains queryable per feature.

FORBIDDEN: Do not call `incrementReworks` more than once per validation failure — each call unconditionally adds 1 to the Reworks counter; extra calls produce an inflated count that blocks the rework limit check.

## REFERENCES

- [**sdk_core.md**](./sdk_core.md): Foundation — IFileStateManager port, FileStateManager adapter, atomic write pattern, and F001 known limitations
- [**sdk_agent_runner.md**](./sdk_agent_runner.md): Outbound port implementation that calls appendDecision indirectly via HarnessOrchestrator
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Ports-and-Adapters structure, atomic writes convention, domain parameter guard
