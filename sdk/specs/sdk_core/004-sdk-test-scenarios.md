# Test Scenarios — SDK Core (F001)

Domain: `sdk_core`
Project: `sdk`
Framework: TBD (to be defined in F001 implementation plan)
Sources: `001-problem-space.md`, `002-context-map.md`, `003-sdk-tactical-design.md`

---

## Coverage Map

| Category | Target | Scenarios |
|---|---|---|
| Unit | Value objects and type guards | TS-U-01 → TS-U-06 |
| Unit | StateMachine transitions | TS-U-07 → TS-U-17 |
| Unit | ValidationGate verdict rules | TS-U-18 → TS-U-26 |
| Unit | JsonExtractionProtocol | TS-U-27 → TS-U-32 |
| Unit | ContextAssembler payloads | TS-U-33 → TS-U-37 |
| Unit | ReentryResolver | TS-U-38 → TS-U-45 |
| Integration | FileStateManager (real filesystem via temp dir) | TS-I-01 → TS-I-18 |
| Functional | Full run() loop execution | TS-F-01 → TS-F-09 |

---

## Unit Tests — Value Objects and Type Guards (TS-U-01 → TS-U-06)

### TS-U-01: FeatureStatus exhaustiveness
- **Given:** The `FeatureStatus` type definition
- **When:** All six values (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `BLOCKED`, `FAILED`) are assigned to a variable of type `FeatureStatus`
- **Then:** TypeScript compile step succeeds with zero errors; a sixth value not in the type causes a compile error

### TS-U-02: Feature with null scores
- **Given:** A `Feature` object with `scoreTL: null` and `scoreAdv: null`
- **When:** The object is constructed and its fields are read
- **Then:** Fields return `null`; no implicit coercion to `0` occurs

### TS-U-03: Feature with populated scores
- **Given:** A `Feature` object with `scoreTL: 0.85` and `scoreAdv: 0.72`
- **When:** The object is constructed and its fields are read
- **Then:** Fields return `0.85` and `0.72` exactly

### TS-U-04: Task default phase value
- **Given:** A `Task` object constructed with `currentPhase: '-'`
- **When:** `currentPhase` is read
- **Then:** Returns `'-'` (the `CurrentPhase` union literal, not `undefined`)

### TS-U-05: BootstrapConfig default thresholds
- **Given:** A `BootstrapConfig` object with both thresholds set to `0.70` and `maxReworks: 2`
- **When:** Each field is accessed
- **Then:** Returns the exact numeric values without mutation

### TS-U-06: OrchestratorConfig requires IAgentRunner
- **Given:** An `OrchestratorConfig` object missing the `agentRunner` field
- **When:** TypeScript compiles the assignment
- **Then:** Compile error is emitted (field is required, not optional)

---

## Unit Tests — StateMachine Transitions (TS-U-07 → TS-U-17)

### TS-U-07: BOOTSTRAP → PHASE_A when files initialized and scope confirmed
- **Given:** `currentPhase = BOOTSTRAP`, all four product files exist, scope is set
- **When:** `StateMachine.next(BOOTSTRAP, state)` is called
- **Then:** Returns `Phase.PHASE_A`

### TS-U-08: PHASE_A → CASCADE_BLOCKED when dependency is BLOCKED
- **Given:** `currentPhase = PHASE_A`, active feature has a dependency with `status = BLOCKED`
- **When:** `StateMachine.next(PHASE_A, state)` is called
- **Then:** Returns `Phase.CASCADE_BLOCKED`

### TS-U-09: PHASE_A → PHASE_B when all spec files present
- **Given:** `currentPhase = PHASE_A`, all `004-*-test-scenarios.md` files are present, no blocked dependencies
- **When:** `StateMachine.next(PHASE_A, state)` is called
- **Then:** Returns `Phase.PHASE_B`

### TS-U-10: PHASE_B → PHASE_B (running) when TDD-OUTPUT.json absent and tasks remain
- **Given:** `currentPhase = PHASE_B`, `TDD-OUTPUT.json` absent, at least one task `NOT_STARTED`
- **When:** `StateMachine.next(PHASE_B, state)` is called
- **Then:** Returns `Phase.PHASE_B` (loop continues)

### TS-U-11: PHASE_B → PHASE_C when all tasks COMPLETED
- **Given:** `currentPhase = PHASE_B`, all tasks for active feature have `status = COMPLETED`
- **When:** `StateMachine.next(PHASE_B, state)` is called
- **Then:** Returns `Phase.PHASE_C`

### TS-U-12: PHASE_C → PHASE_D on PASS verdict
- **Given:** `currentPhase = PHASE_C`, scores above both thresholds, no high/critical vulnerability
- **When:** `StateMachine.next(PHASE_C, state)` is called
- **Then:** Returns `Phase.PHASE_D`

### TS-U-13: PHASE_C → PHASE_B on RETRY verdict
- **Given:** `currentPhase = PHASE_C`, score below threshold, `Reworks < maxReworks`
- **When:** `StateMachine.next(PHASE_C, state)` is called
- **Then:** Returns `Phase.PHASE_B`

### TS-U-14: PHASE_C → PHASE_D on BLOCK verdict
- **Given:** `currentPhase = PHASE_C`, score below threshold, `Reworks >= maxReworks`, `isCrashing = true`
- **When:** `StateMachine.next(PHASE_C, state)` is called
- **Then:** Returns `Phase.PHASE_D`

### TS-U-15: PHASE_C → PHASE_D on FAIL verdict
- **Given:** `currentPhase = PHASE_C`, score below threshold, `Reworks >= maxReworks`, `isCrashing = false`
- **When:** `StateMachine.next(PHASE_C, state)` is called
- **Then:** Returns `Phase.PHASE_D`

### TS-U-16: PHASE_D → PHASE_E when executable features remain
- **Given:** `currentPhase = PHASE_D`, at least one feature with `status = NOT_STARTED`
- **When:** `StateMachine.next(PHASE_D, state)` is called
- **Then:** Returns `Phase.PHASE_E`

### TS-U-17: PHASE_D → PHASE_E when no executable features remain
- **Given:** `currentPhase = PHASE_D`, all features in terminal status
- **When:** `StateMachine.next(PHASE_D, state)` is called
- **Then:** Returns `Phase.PHASE_E` (always — HALTED is set inside runPhaseE)

---

## Unit Tests — ValidationGate Verdict Rules (TS-U-18 → TS-U-26)

### TS-U-18: PASS — both scores above threshold, no vulnerability
- **Given:** `scoreTL = 0.80`, `scoreAdv = 0.75`, `thresholdTL = 0.70`, `thresholdAdv = 0.70`, `hasHighCriticalVuln = false`
- **When:** `ValidationGate.evaluate(scores, reworks=0, config, isCrashing=false)` is called
- **Then:** `verdict = PASS`

### TS-U-19: PASS — scores exactly at threshold boundary
- **Given:** `scoreTL = 0.70`, `scoreAdv = 0.70`, thresholds both `0.70`, no vulnerability
- **When:** `evaluate(...)` is called
- **Then:** `verdict = PASS` (boundary is inclusive)

### TS-U-20: RETRY — TL score below threshold, reworks budget not exhausted
- **Given:** `scoreTL = 0.60`, `scoreAdv = 0.80`, `thresholdTL = 0.70`, `reworks = 1`, `maxReworks = 2`
- **When:** `evaluate(...)` is called
- **Then:** `verdict = RETRY`

### TS-U-21: RETRY — Adv score below threshold, reworks budget not exhausted
- **Given:** `scoreTL = 0.80`, `scoreAdv = 0.60`, `thresholdAdv = 0.70`, `reworks = 0`, `maxReworks = 2`
- **When:** `evaluate(...)` is called
- **Then:** `verdict = RETRY`

### TS-U-22: RETRY — high/critical vulnerability present, reworks budget not exhausted
- **Given:** Both scores above threshold, `hasHighCriticalVuln = true`, `reworks = 0`, `maxReworks = 2`
- **When:** `evaluate(...)` is called
- **Then:** `verdict = RETRY`

### TS-U-23: BLOCK — score below threshold, reworks exhausted, isCrashing true
- **Given:** `scoreTL = 0.50`, `thresholdTL = 0.70`, `reworks = 2`, `maxReworks = 2`, `isCrashing = true`
- **When:** `evaluate(...)` is called
- **Then:** `verdict = BLOCK`

### TS-U-24: FAIL — score below threshold, reworks exhausted, isCrashing false
- **Given:** `scoreTL = 0.50`, `thresholdTL = 0.70`, `reworks = 2`, `maxReworks = 2`, `isCrashing = false`
- **When:** `evaluate(...)` is called
- **Then:** `verdict = FAIL`

### TS-U-25: BLOCK — vulnerability, reworks exhausted, isCrashing true
- **Given:** Both scores above threshold, `hasHighCriticalVuln = true`, `reworks = 2`, `maxReworks = 2`, `isCrashing = true`
- **When:** `evaluate(...)` is called
- **Then:** `verdict = BLOCK`

### TS-U-26: VerdictResult includes non-empty reason
- **Given:** Any valid input combination
- **When:** `evaluate(...)` is called
- **Then:** `result.reason` is a non-empty string describing the rationale

---

## Unit Tests — JsonExtractionProtocol (TS-U-27 → TS-U-32)

### TS-U-27: Extract JSON from Markdown fences
- **Given:** Raw string containing ` ```json\n{"score": 0.85}\n``` `
- **When:** `JsonExtractionProtocol.extract(raw)` is called
- **Then:** Returns `{ score: 0.85 }` as a parsed object

### TS-U-28: Extract JSON from bare object (no fences)
- **Given:** Raw string `"Some text before { \"score\": 0.72 } some text after"`
- **When:** `extract(raw)` is called
- **Then:** Returns `{ score: 0.72 }`

### TS-U-29: Return ExtractionError on unparseable content
- **Given:** Raw string with no JSON-like content
- **When:** `extract(raw)` is called
- **Then:** Returns an `ExtractionError` object (not throws)

### TS-U-30: Return ExtractionError on syntactically invalid JSON
- **Given:** Raw string ` ```json\n{ score: 0.85 }\n``` ` (unquoted key)
- **When:** `extract(raw)` is called
- **Then:** Returns an `ExtractionError` (not throws)

### TS-U-31: Multiple fences — first fence wins
- **Given:** Raw string with two JSON fences, first has `{"score": 0.80}`, second has `{"score": 0.50}`
- **When:** `extract(raw)` is called
- **Then:** Returns `{ score: 0.80 }` (first fence)

### TS-U-32: Extraction never throws
- **Given:** Any string including empty string, null-like values, or deeply nested invalid JSON
- **When:** `extract(raw)` is called
- **Then:** Always returns either `ExtractionResult` or `ExtractionError` — never throws an exception

---

## Unit Tests — ContextAssembler Payloads (TS-U-33 → TS-U-37)

### TS-U-33: Phase A payload contains only required fields
- **Given:** A `Feature` object and `projectPaths = ["/path/to/project"]`
- **When:** `ContextAssembler.buildPhaseAPayload(feature, projectPaths)` is called
- **Then:** Payload contains `scope`, `domain`, `projectPaths`; does NOT contain `scoreTL`, `scoreAdv`, or any task-level data

### TS-U-34: Phase B payload includes retry flag and rework log path
- **Given:** A feature with `reworks = 1`, task list, projectPaths
- **When:** `ContextAssembler.buildPhaseBPayload(feature, tasks, projectPaths, isRetry=true)` is called
- **Then:** Payload contains `isRetry: true` and `reworkLogPath` pointing to `docs/specs/{domain}/REWORK-LOG.md`

### TS-U-35: Phase B payload excludes rework log when not a retry
- **Given:** A feature with `reworks = 0`, `isRetry = false`
- **When:** `buildPhaseBPayload(...)` is called
- **Then:** Payload does NOT contain `reworkLogPath`

### TS-U-36: Phase C payload contains feature ID, domain, and project paths only
- **Given:** A feature, projectPaths
- **When:** `ContextAssembler.buildPhaseCPayload(feature, projectPaths)` is called
- **Then:** Payload contains `featureId`, `domain`, `projectPaths`; does NOT contain task details or scores

### TS-U-37: Phase E payload contains domain, scope description, and completedCycles
- **Given:** A completed feature, `completedCycles = 3`, recent decisions list
- **When:** `ContextAssembler.buildPhaseEPayload(feature, completedCycles, decisions)` is called
- **Then:** Payload contains `domain`, `scopeDescription`, `completedCycles`, `recentDecisions`

---

## Unit Tests — ReentryResolver (TS-U-38 → TS-U-45)

### TS-U-38: Fresh state resolves to BOOTSTRAP
- **Given:** No product files exist on disk (empty `docs/product/`)
- **When:** `ReentryResolver.resolve(state)` is called
- **Then:** Returns `Phase.BOOTSTRAP`

### TS-U-39: All files exist, feature is NOT_STARTED resolves to PHASE_A
- **Given:** All product files present, active feature has `status = NOT_STARTED`, spec files absent
- **When:** `resolve(state)` is called
- **Then:** Returns `Phase.PHASE_A`

### TS-U-40: Spec files present resolves to PHASE_B
- **Given:** All product files present, `004-*-test-scenarios.md` exists, tasks present and NOT_STARTED, TDD-OUTPUT.json absent
- **When:** `resolve(state)` is called
- **Then:** Returns `Phase.PHASE_B`

### TS-U-41: TDD-OUTPUT.json present, all tasks COMPLETED resolves to PHASE_C
- **Given:** `TDD-OUTPUT.json` present, all tasks `COMPLETED`
- **When:** `resolve(state)` is called
- **Then:** Returns `Phase.PHASE_C`

### TS-U-42: Feature COMPLETED, more features remain resolves to PHASE_D
- **Given:** Active feature `COMPLETED`, at least one `NOT_STARTED` feature remains
- **When:** `resolve(state)` is called
- **Then:** Returns `Phase.PHASE_D`

### TS-U-43: All features in terminal state resolves to PHASE_D (then HALTED in PhaseE)
- **Given:** All features in terminal status, no feature `NOT_STARTED`
- **When:** `resolve(state)` is called
- **Then:** Returns `Phase.PHASE_D` (final loop pass)

### TS-U-44: Dependency BLOCKED resolves to CASCADE_BLOCKED
- **Given:** Active feature's dependency has `status = BLOCKED`
- **When:** `resolve(state)` is called during PHASE_A
- **Then:** Returns `Phase.CASCADE_BLOCKED`

### TS-U-45: Table is ordered — first matching condition always wins
- **Given:** An `OnDiskState` where two conditions simultaneously match (e.g., spec files present AND all tasks completed)
- **When:** `resolve(state)` is called
- **Then:** Returns the phase corresponding to the condition that appears FIRST in the State Transition Table

---

## Integration Tests — FileStateManager (TS-I-01 → TS-I-18)

All integration tests use a real temporary directory. No mocks for filesystem I/O.

### TS-I-01: ensureProductFiles creates all four files when none exist
- **Given:** An empty temp directory as `productDir`
- **When:** `fileStateManager.ensureProductFiles()` is called
- **Then:** All four files (`BACKLOG.md`, `DEVELOPMENT-STATE.md`, `DECISIONS.md`, `BOOTSTRAP-CONFIG.json`) are created with valid default content

### TS-I-02: ensureProductFiles is idempotent when files already exist
- **Given:** Product files already exist with custom content
- **When:** `ensureProductFiles()` is called again
- **Then:** Files are unchanged; no overwrite occurs

### TS-I-03: loadBacklog parses a valid BACKLOG.md
- **Given:** A `BACKLOG.md` file with three feature rows
- **When:** `loadBacklog()` is called
- **Then:** Returns a `Feature[]` array of length 3 with correct field values

### TS-I-04: loadBacklog returns empty array for empty BACKLOG.md
- **Given:** A `BACKLOG.md` file with only the header row
- **When:** `loadBacklog()` is called
- **Then:** Returns `[]`

### TS-I-05: saveFeatureStatus updates correct row without touching others
- **Given:** A `BACKLOG.md` with three features, second feature is the target
- **When:** `saveFeatureStatus('F002', 'COMPLETED', { tl: 0.85, adv: 0.80 })` is called
- **Then:** Only the F002 row is updated; F001 and F003 rows are unchanged

### TS-I-06: incrementFeatureReworks increments only the target feature
- **Given:** `BACKLOG.md` with F001 `Reworks = 0` and F002 `Reworks = 1`
- **When:** `incrementFeatureReworks('F002')` is called
- **Then:** F002 `Reworks = 2`; F001 `Reworks = 0` (unchanged)

### TS-I-07: loadBootstrapConfig returns typed object with default thresholds
- **Given:** A valid `BOOTSTRAP-CONFIG.json` with thresholds `0.70` and `maxReworks: 2`
- **When:** `loadBootstrapConfig()` is called
- **Then:** Returns `BootstrapConfig` with exact numeric values

### TS-I-08: saveBootstrapConfig persists cycleCounter update
- **Given:** Existing config with `completedCycles: 0`
- **When:** `saveBootstrapConfig({ ...config, cycleCounter: { completedCycles: 3 } })` is called and `loadBootstrapConfig()` is called again
- **Then:** Returns config with `completedCycles: 3`

### TS-I-09: appendDecision appends to existing DECISIONS.md
- **Given:** A `DECISIONS.md` with one prior entry
- **When:** `appendDecision("Feature F001 ACCEPTED — TL: 0.85, Adv: 0.80.")` is called
- **Then:** File contains both the prior entry and the new entry; prior entry is unmodified

### TS-I-10: appendDecision creates DECISIONS.md if absent
- **Given:** `DECISIONS.md` does not exist
- **When:** `appendDecision("First entry.")` is called
- **Then:** File is created with the entry; no error thrown

### TS-I-11: appendTasks adds rows to DEVELOPMENT-STATE.md
- **Given:** An empty `DEVELOPMENT-STATE.md` (header only)
- **When:** `appendTasks([task1, task2])` is called
- **Then:** File contains two new rows with correct column values

### TS-I-12: updateTaskStatus updates correct task row
- **Given:** `DEVELOPMENT-STATE.md` with three task rows for F001
- **When:** `updateTaskStatus('T02', 'IMPLEMENTATION', 'IN_PROGRESS')` is called
- **Then:** Only the T02 row is updated; T01 and T03 rows are unchanged

### TS-I-13: updateAllFeatureTasks updates all tasks for a feature atomically
- **Given:** `DEVELOPMENT-STATE.md` with tasks for F001 and F002
- **When:** `updateAllFeatureTasks('F001', 'VALIDATION', 'IN_PROGRESS')` is called
- **Then:** All F001 tasks have `currentPhase = VALIDATION`, `status = IN_PROGRESS`; F002 tasks unchanged

### TS-I-14: writeReworkLog creates REWORK-LOG.md under correct domain path
- **Given:** A temp working directory with `docs/specs/sdk_core/` path structure
- **When:** `writeReworkLog('sdk_core', 'open points: ...')` is called
- **Then:** File `docs/specs/sdk_core/REWORK-LOG.md` exists with the provided content

### TS-I-15: writeReworkLog appends on second call (does not overwrite)
- **Given:** An existing `REWORK-LOG.md` with prior rework content
- **When:** `writeReworkLog('sdk_core', 'second rework content')` is called
- **Then:** File contains both rework entries

### TS-I-16: Atomic write — file content is consistent after save
- **Given:** A valid `BACKLOG.md`
- **When:** `saveFeatureStatus` is called and the resulting file is immediately read back
- **Then:** The file is a valid markdown table (not partially written); no truncated rows

### TS-I-17: loadDevelopmentState returns empty array for header-only file
- **Given:** `DEVELOPMENT-STATE.md` with only the header row
- **When:** `loadDevelopmentState()` is called
- **Then:** Returns `[]`

### TS-I-18: loadBacklog gracefully handles missing optional columns
- **Given:** A `BACKLOG.md` where `Score (TL)` and `Score (Adv)` columns contain `-`
- **When:** `loadBacklog()` is called
- **Then:** Returns `Feature[]` with `scoreTL: null` and `scoreAdv: null` (not `NaN`, not `0`)

---

## Functional Tests — Full run() Loop Execution (TS-F-01 → TS-F-09)

All functional tests use a real temp directory for filesystem and a `FakeAgentRunner` (test double that simulates agent responses via pre-configured stubs, implementing `IAgentRunner`).

### TS-F-01: Single feature, PASS on first attempt — full loop executes to HALT
- **Given:** Config with one feature, `FakeAgentRunner` configured to return PASS-level scores (`scoreTL=0.85, scoreAdv=0.80`)
- **When:** `orchestrator.run()` resolves
- **Then:** `BACKLOG.md` shows feature `COMPLETED` with correct scores; `DEVELOPMENT-STATE.md` all tasks `COMPLETED`; `BOOTSTRAP-CONFIG.json` `completedCycles = 1`; `DECISIONS.md` contains acceptance log entry

### TS-F-02: Single feature, RETRY once then PASS — reworks counter reflects one retry
- **Given:** `FakeAgentRunner` returns failing scores on first Phase C call, passing scores on second
- **When:** `orchestrator.run()` resolves
- **Then:** Feature `COMPLETED`; `Reworks = 1` in `BACKLOG.md`; `REWORK-LOG.md` exists under the feature's domain; `completedCycles = 1`

### TS-F-03: Single feature, BLOCK after maxReworks — feature status is BLOCKED
- **Given:** `FakeAgentRunner` always returns failing scores, `isCrashing = true`; `maxReworks = 2`
- **When:** `orchestrator.run()` resolves
- **Then:** Feature `BLOCKED`; `Reworks = 2`; `DECISIONS.md` contains block rationale

### TS-F-04: Single feature, FAIL after maxReworks — feature status is FAILED
- **Given:** `FakeAgentRunner` always returns failing scores, `isCrashing = false`; `maxReworks = 2`
- **When:** `orchestrator.run()` resolves
- **Then:** Feature `FAILED`; `DECISIONS.md` contains fail rationale with "non-blocking" note

### TS-F-05: Two features, second depends on first — sequential execution, both PASS
- **Given:** F002 has `dependencies: ['F001']`; `FakeAgentRunner` returns PASS-level scores for both
- **When:** `orchestrator.run()` resolves
- **Then:** F001 `COMPLETED` before F002 begins Phase A; F002 `COMPLETED`; `completedCycles = 2`

### TS-F-06: Two features, second depends on first — first BLOCKED causes cascade
- **Given:** F002 has `dependencies: ['F001']`; F001 ends as `BLOCKED`
- **When:** `orchestrator.run()` resolves
- **Then:** F002 status is `BLOCKED` (cascade); `DECISIONS.md` contains cascade block log; loop halts after Phase E

### TS-F-07: Resume after crash during Phase B — re-entry picks up at Phase B
- **Given:** Product files exist on disk with F001 in Phase B, one task `IN_PROGRESS`; `FakeAgentRunner` returns valid TDD output
- **When:** A new `HarnessOrchestrator` is constructed and `run()` is called (simulating crash recovery)
- **Then:** Loop resumes from Phase B (not BOOTSTRAP); no duplicate task rows appended to `DEVELOPMENT-STATE.md`

### TS-F-08: IAgentRunner is called with correct skill per phase
- **Given:** `FakeAgentRunner` records all invocations; PASS-level scores returned
- **When:** `orchestrator.run()` completes
- **Then:** Invocation log contains exactly one Phase A call (`scope-refinement`), one or more Phase B calls (`tdd-orchestrator`), two Phase C calls (`the-grumpy-tech-lead` and `adversarial-qa`), one Phase E call (`project-memory`)

### TS-F-09: Context payload does not contain extraneous fields
- **Given:** `FakeAgentRunner` records all payloads; one feature, PASS on first attempt
- **When:** `orchestrator.run()` completes
- **Then:** Phase A payload contains `scope`, `domain`, `projectPaths` and nothing else; Phase C payload contains `featureId`, `domain`, `projectPaths` and nothing else
