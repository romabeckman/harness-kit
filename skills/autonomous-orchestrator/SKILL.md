---
name: autonomous-orchestrator
description: Sovereign loop manager. Handles file initialization, feature lifecycle tracking, and recursive TDD-Validation-Optimization cycles. Strictly delegates all technical tasks to sub-agents.
---

<execution_gate>

## ⚠️ Step 0 — Initial Input Gate (ONLY permitted pause window)

**Step 0a — Action selection.** ASK the user ONCE with the following options and HALT until answered:

> **What would you like to do?**
>
> - **`resume`** — continue from where the previous session stopped (`docs/product/` is preserved as-is)
> - **`reset`** — discard current `docs/product/` and start a new cycle (scope will be collected next)

**Step 0b — Scope collection (only when action is `reset`).** After the user picks `reset`, ASK for the scope as plain text:

> **Please describe the project scope or paste the PRD:**

Store the text answer as `${scope}`.

```
IF user answered "resume" in Step 0a:
    → SKIP BOOTSTRAP. Apply re-entry rule from Orchestration Loop State Transition Table.

IF user answered "reset" in Step 0a:
    → Delete all files under `docs/product/`.
    → Use ${scope} collected in Step 0b. Proceed to BOOTSTRAP.
```

**Once Step 0 and any missing Bootstrap inputs are resolved — for the entire session:**

- NEVER stop, ask questions, request confirmations, or pause
- Execute BOOTSTRAP → optional REFINEMENT → PLANNING → DEVELOPMENT → REVIEW → TRANSITION → MEMORY → DEPLOY **atomically**
- Log every decision and transition to `BACKLOG.md` + `DEVELOPMENT-STATE.md` before advancing

</execution_gate>

---

<role>

**Sovereign Orchestrator.** Drive `BACKLOG.md` to completion via state management and agent delegation.  
You do NOT write code, tests, or perform any sub-agent task.

**Agent mappings (strict):**

| Skill | Agent |
|---|---|
| `harness-kit:scope-refinement` | `software-architect` |
| `harness-kit:tdd-orchestrator` | Agent selected by the feature's `Agent` column: `developer-backend`, `developer-frontend`, `developer-qa`, or `developer-devops` (`developer-debugging` is diagnostic only) |
| `harness-kit:adversarial-qa` | `harness-qa` |
| `harness-kit:the-grumpy-tech-lead` | `harness-tech-lead` |
| `harness-kit:project-memory` | `software-architect` (Phase E only) |

</role>

---

<bootstrap>

## 1. BOOTSTRAP — State Initialization

Execute steps in order. ASK each missing value ONCE, then never again.

**1.1 Acquire inputs (if not already present):**

```
IF BACKLOG.md missing or empty  → ASK for project scope/PRD. Store as ${scope}.
IF project paths unknown        → ASK for local paths of all involved projects. Store as ${projectPaths}.

Thresholds (${scoreThresholdTL} and ${scoreThresholdAdv}) and ${maxReworks} are loaded from BOOTSTRAP-CONFIG.json (default 0.70 and 2, respectively).
```

**1.2 Synthesize backlog:**  
Parse `${scope}` → generate initial `BACKLOG.md` table with columns:  
`ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status`

- `Domain`: snake_case from feature title (e.g., `user_authentication`)
- `Agent`: `backend`, `frontend`, `qa`, or `devops`; infer from feature scope and project paths
- `Reworks`: init `0` | Scores: init `-` | Status: init `NOT_STARTED`
- **Granularity rule:** each row is one cohesive, independently testable functional module. Group related operations, tests, and supporting changes. Never create single-endpoint, single-file, test-only, or configuration-only features.

**1.3 Create files (Initialize by copying templates):**

For each required product file in `docs/product/`, if it does not already exist, copy it from the template model located in `skills/autonomous-orchestrator/models/`:

| File | Initial State & Copy Source |
|---|---|
| `docs/product/BACKLOG.md` | Copy from `skills/autonomous-orchestrator/models/BACKLOG.md` (then populate with features from step 1.2) |
| `docs/product/DEVELOPMENT-STATE.md` | Copy from `skills/autonomous-orchestrator/models/DEVELOPMENT-STATE.md` |
| `docs/product/DECISIONS.md` | Copy from `skills/autonomous-orchestrator/models/DECISIONS.md` |
| `docs/product/BOOTSTRAP-CONFIG.json` | Copy from `skills/autonomous-orchestrator/models/BOOTSTRAP-CONFIG.json` (substituting collected score thresholds and max reworks) |

> `DEVELOPMENT-STATE.md` is task-level only. `Reworks`, `Score (TL)`, `Score (Adv)` are feature-level and live in `BACKLOG.md`.
> `BOOTSTRAP-CONFIG.json` is the loop's definition of done: `scoreThresholds` + `completionCriteria.maxReworks` together determine the PASS/RETRY/BLOCK/FAIL verdict in Phase C and the completion check in Phase D.

**1.4 Persist runtime state:** Store `${projectPaths}`, set `${completedCycles} = 0`, `currentPhase = BOOTSTRAP`, and `activeFeatureId = null` in `BOOTSTRAP-CONFIG.json`. Preserve phase-scoped `steeringRules` when supplied.

**1.5 Optional refinement:** When refinement is enabled and `docs/product/REFINEMENT.md` is absent, run the interactive `REFINEMENT` handler once, persist its output, then continue to Phase A. Otherwise continue directly to Phase A.

</bootstrap>

---

<orchestration_loop>

## 2. ORCHESTRATION LOOP

### State Transition Table

> **Re-entry rule:** On crash/resume, first honor a valid persisted `BOOTSTRAP-CONFIG.json.currentPhase` other than `HALTED`. If absent or invalid, scan this table top-to-bottom and enter at the FIRST matching condition against current on-disk state. Before re-entering `PHASE_C`, check the active feature. If terminal, finish any pending C6 updates for its saved verdict and go to `PHASE_D`. Otherwise, apply the Phase C gate and return to `PHASE_B` if it fails. Persist `currentPhase` and `activeFeatureId` before every phase invocation.

| Current State | Condition | Next State | Actions |
|---|---|---|---|
| `BOOTSTRAP` | Scope confirmed, files initialized, refinement disabled or complete | `PHASE_A` | Select next `NOT_STARTED` feature; persist `activeFeatureId` |
| `PHASE_A` | Any dependency `Status = BLOCKED` | `CASCADE_BLOCKED` | Set feature `BLOCKED`; log `DECISIONS.md`; skip to next |
| `PHASE_A` | Specs verified and tasks recorded per A3–A4 | `PHASE_B` | Preserve existing task statuses |
| `PHASE_B` | No reusable handoff per B1 | `PHASE_B (running)` | Select tasks per B1 and invoke `tdd-orchestrator` |
| `PHASE_B` or `PHASE_B (running)` | Reusable or fresh handoff passes B3 | `PHASE_C` | Complete task updates per B3 and pass `developerHandoff` to reviewers |
| `PHASE_C` | C6 verdict is `PASS` | `PHASE_D` | Mark feature `COMPLETED` in `BACKLOG.md`; update scores |
| `PHASE_C` | C6 verdict is `RETRY` | `PHASE_B (RETRY)` | Increment `Reworks`; write `REWORK-LOG.md`; reset tasks `NOT_STARTED` |
| `PHASE_C` | C6 verdict is `BLOCK` | `PHASE_D` | Mark feature `BLOCKED` in `BACKLOG.md` |
| `PHASE_C` | C6 verdict is `FAIL` | `PHASE_D` | Mark feature `FAILED` in `BACKLOG.md` |
| `PHASE_D` | Executable features remain | `PHASE_A` | Increment `${completedCycles}`; select and persist next feature without running memory |
| `PHASE_D` | No executable features remain | `PHASE_E` | Increment `${completedCycles}`; clear `activeFeatureId`; persist memory once for completed scope |
| `PHASE_E` | Memory persisted or explicitly skipped | `DEPLOY` | Delegate deployment when authorized; otherwise record skip |
| `DEPLOY` | All project paths processed or deployment skipped | `HALTED` | Clear active feature; persist terminal state |

---

<phase id="A" name="Planning Delegation">

### Phase A — Delegation of Planning

**A1. State log:**

```
BACKLOG.md[feature].Status → IN_PROGRESS
DECISIONS.md → "Started planning for {ID}."
```

**A2. Delegate** → `harness-kit:scope-refinement` via `software-architect` (Autonomous Mode):

```
inputs:
  ${scope}        = feature Title + Description from BACKLOG.md
  ${projectPaths} = paths from BOOTSTRAP
  ${domain}       = Domain column value for this feature
  ${rules}        = "No additional rules provided"  // unless constraints exist
```

**A3. Verify:** Require a non-empty `docs/specs/{domain}/004-*-test-scenarios.md` and a corresponding `003-*-tactical-design.md` for each project in `${projectPaths}` before proceeding to A4.

**A4. Task breakdown:**  
In each expected `003-*-tactical-design.md`, parse the fenced JSON array immediately after `## Section 6 — Ordered Development Tasks`. Require at least one task per file and a non-empty `id` and `title` for every task. After validating all files, add only rows missing from `DEVELOPMENT-STATE.md` by `Feature ID + Project + Task ID`. Preserve existing rows and statuses.

```
Feature ID | Task ID | Project | Description | Domain | Current Phase: - | Status: NOT_STARTED
```

- `Task ID` = `id` field from JSON (e.g., `"01"`)
- `Description` = `title` field from JSON
- `Project` = root folder name of the source project (e.g., `order-service`, `checkout-ui`)

If any required spec is missing, empty, or invalid, log the evidence in `DECISIONS.md` and keep the feature in Phase A.

</phase>

---

<phase id="B" name="Implementation Delegation">

### Phase B — Delegation of Implementation

**B1. Select feature tasks and log state:**

If the feature has no task rows, return to Phase A to recover them. On re-entry, if each task is `IN_PROGRESS` or `COMPLETED` and the saved handoff satisfies B3, apply B3 and skip dispatch. Otherwise require a fresh handoff. Select all pending tasks, including those left `IN_PROGRESS`. If all are already `COMPLETED`, select them all for re-verification.

```
DEVELOPMENT-STATE.md[selected feature tasks].Current Phase → IMPLEMENTATION
DEVELOPMENT-STATE.md[selected feature tasks].Status        → IN_PROGRESS
```

**B2. Delegate** → `harness-kit:tdd-orchestrator` via appropriate developer agent (Autonomous Mode):

```
inputs:
  ${featureId}    = feature ID (e.g., "F001")
  ${domain}       = Domain column value
  ${projectPaths} = paths from BOOTSTRAP
  ${tasks}        = selected task IDs and descriptions from DEVELOPMENT-STATE.md
  impl_spec       = docs/specs/{domain}/003-*-tactical-design.md
  test_spec       = docs/specs/{domain}/004-*-test-scenarios.md
  // IF RETRY: also pass docs/specs/{domain}/REWORK-LOG.md
```

**B3. Verify:** Wait for `docs/specs/{domain}/TDD-OUTPUT.json`. Require matching `featureId`, `status = "SUCCESS"`, zero failed tests, and a `developerHandoff` of at most 500 characters before marking all pending feature tasks `COMPLETED`. Missing, corrupt, mismatched, or failed output must not advance to Phase C; log the evidence and keep affected tasks non-complete. Pass `developerHandoff` to both Phase C reviewers as navigation context; reviewers must independently verify it.

</phase>

---

<phase id="C" name="Validation Gate">

### Phase C — Validation & Decision Gate

> **GATE:** Begin Phase C only when the active feature has tasks in `DEVELOPMENT-STATE.md`, every task is `COMPLETED`, and `TDD-OUTPUT.json` satisfies B3. If any check fails, return to Phase B and apply B1.

**C1. Load thresholds and criteria** (on entry or re-entry):

```
IF ${scoreThresholdTL} or ${scoreThresholdAdv} not in memory:
    → Load from docs/product/BOOTSTRAP-CONFIG.json -> scoreThresholdTL / scoreThresholdAdv
IF ${maxReworks} not in memory:
    → Load from docs/product/BOOTSTRAP-CONFIG.json -> completionCriteria.maxReworks
```

**C2. State log:**

```
DEVELOPMENT-STATE.md[all tasks for feature].Current Phase → VALIDATION
```

**C3–C4. Parallel dispatch** (both MUST run simultaneously):

```
C3: harness-kit:the-grumpy-tech-lead (harness-tech-lead agent, Autonomous Mode)
    inputs: ${featureId}, ${domain}, ${projectPaths}
    → Writes report to docs/specs/${domain}/TL.json

C4: harness-kit:adversarial-qa (harness-qa agent, Autonomous Mode)
    inputs: ${featureId}, ${domain}, ${projectPaths}
    → Writes report to docs/specs/${domain}/QA.json
```

**C5. Read JSON Reports:**
Read `docs/specs/${domain}/TL.json` (Score A) and `docs/specs/${domain}/QA.json` (Score B). If a file is missing or corrupt, fallback to parsing stdout extraction.

**C6. Verdict Gate & DECISIONS.md update:**

Evaluate the gates below in order and apply the first match. Treat `isCrashing` as true if either reviewer reports it.

<gate id="PASS">

```
IF feature's Score A >= ${scoreThresholdTL} AND Score B >= ${scoreThresholdAdv}
   AND no HIGH/CRITICAL vulnerability AND isCrashing != true:
```

1. `BACKLOG.md[feature]` (the active feature in backlog) → `Status: COMPLETED`, `Score (TL): A`, `Score (Adv): B`
2. All feature tasks in `DEVELOPMENT-STATE.md` → `Current Phase: -`, `Status: COMPLETED`
3. `DECISIONS.md` → `"Feature {ID} ACCEPTED — TL: {A}, Adv: {B}."`
4. Delete stale `TDD-OUTPUT.json` after review processing
5. → Phase D

</gate>

<gate id="RETRY">

```
IF PASS did not match AND Reworks < ${maxReworks}:
```

1. `BACKLOG.md[feature].Reworks++` (for the active feature in backlog)
2. Append to `docs/specs/{domain}/REWORK-LOG.md`:
   - `openPoints` from `the-grumpy-tech-lead`
   - `edgeCasesMissed` from `adversarial-qa`
   - `vulnerabilities` from `adversarial-qa`, with severity and description
   - Any reported crash and its evidence
3. `DECISIONS.md` → `"Feature {ID} RETRY #{n} — TL: {A}, Adv: {B}. Reason: {top finding}."`
4. **ATOMIC WRITE:** All feature tasks → `Current Phase: -`, `Status: NOT_STARTED`
5. Delete stale `TDD-OUTPUT.json`
6. → Phase B

</gate>

<gate id="BLOCK">

```
IF PASS did not match AND Reworks >= ${maxReworks}
   AND (isCrashing == true OR a HIGH/CRITICAL vulnerability remains unresolved):
```

1. `BACKLOG.md[feature]` (the active feature in backlog) → `Status: BLOCKED`
2. All feature tasks → `Current Phase: -`, `Status: BLOCKED`
3. `DECISIONS.md` → `"Feature {ID} BLOCKED after {maxReworks} attempts. Rationale: crash/critical break."`
4. Delete stale `TDD-OUTPUT.json`
5. → Phase D

</gate>

<gate id="FAIL">

```
IF none of the preceding gates matched:
```

1. `BACKLOG.md[feature]` (the active feature in backlog) → `Status: FAILED`
2. All feature tasks → `Current Phase: -`, `Status: FAILED`
3. `DECISIONS.md` → `"Feature {ID} FAILED after {maxReworks} attempts. Rationale: non-blocking issue, continuing development."`
4. Delete stale `TDD-OUTPUT.json`
5. → Phase D

</gate>

</phase>

---

<phase id="D" name="State and Completion Check">

### Phase D — State & Completion Check

**D1. Completion check** — verify ALL of the following against `BACKLOG.md`:

- All features in `BACKLOG.md` are `COMPLETED`, `BLOCKED`, or `FAILED`
- Every `COMPLETED` feature: `Score (TL) >= ${scoreThresholdTL}` AND `Score (Adv) >= ${scoreThresholdAdv}`
- Every `BLOCKED` or `FAILED` feature: `Reworks >= ${maxReworks}`
- No critical vulnerabilities across `adversarial-qa` verdicts (unless the feature was marked as FAILED)

```
IF any criterion fails → log reason in DECISIONS.md
```

**D2. Loop:**

```
IF executable features remain → increment cycle counter, persist next `activeFeatureId`, then Phase A
IF feature is IN_PROGRESS     → read DEVELOPMENT-STATE.md, resume from last completed phase
                                 DO NOT restart from Phase A
IF no executable features remain → clear `activeFeatureId`, then Phase E
```

</phase>

---

<phase id="E" name="Memory Persistence">

### Phase E — Memory Persistence

> **Trigger:** Once, after Phase D finds no executable features. SDK transition loops directly to Phase A between features.

**E1. State log:**

```
DECISIONS.md → "Phase E: persisting project memory across configured project paths."
```

**E2. MANDATORY — Delegate `project-memory` skill to `software-architect` agent (Autonomous Mode, no exceptions, no skipping):**

```
inputs:
  context = summary of changes made in completed cycle:
    - Feature IDs processed (COMPLETED, BLOCKED, FAILED, or RETRY'd)
    - For each COMPLETED feature: ${domain}, scope description (Title + Description from BACKLOG.md), and paths created/modified (from `docs/specs/{domain}/003-*-tactical-design.md` or `TDD-OUTPUT.json`)
    - Final scores (TL + Adv) per COMPLETED feature — internal record only, NOT to appear in `docs/feature/{domain}.md`
    - Key decisions logged in DECISIONS.md this cycle
    - Current ${completedCycles} value
  instructions:
    - REQUIRED (STRICT): All cross-references in generated docs MUST point ONLY to `./docs/adr/` or `./docs/feature/` folders. NO other folder paths are permitted. Validate every reference before finalizing.
    - REQUIRED: In each target project, document completed features under `docs/feature/*.md` (create if missing, update matching topic documents if present), following `./references/DOCUMENT-TEMPLATE.md` strictly; never prefix filenames with feature IDs
    - REQUIRED: `FOLDER STRUCTURE` section → reflect the module's current relevant structure, incorporating paths added or modified this cycle (do not drop paths documented in prior cycles)
    - REQUIRED: Keep all content direct and minimal — enough for a future LLM to orient itself in the codebase without re-reading source files
    - PROHIBITED: Narrative explanations, justifications, or process history (no TDD/validation/score details — those belong in `DECISIONS.md`, not in feature docs)
    - IF the cycle introduced architectural changes (new layers, patterns, integrations, test strategy changes) → update the corresponding `docs/adr/*.md` file, following `./references/ARCHITECTURE-RULES.md` (for `ARCHITECTURE.md`), `./references/TESTS-RULES.md` (for `TESTS.md`), or `./references/DOCUMENT-TEMPLATE.md` (for any other existing ADR)
    - PROHIBITED: Creating a new ADR file during this step unless explicitly requested/decided by a human
    - REQUIRED: Update each target project's `docs/.digest.md` and `docs/.graph.json` after topic documentation
    - PROHIBITED: Reading or modifying `docs/harness-history/`
```

**E3. Transition:**

```
→ DEPLOY. Delegate to `developer-devops` only when deployment is authorized by current repository/user rules. If Git staging, commit, or push is forbidden or deployment is skipped, record the skip and → HALTED without running those commands.
```

</phase>

</orchestration_loop>

---

<json_extraction_protocol>

## 3. JSON Extraction Protocol (Defensive Parsing)

When parsing sub-agent output for metrics:

```
1. Search raw string for Markdown fences containing JSON.
2. IF none found: extract substring from first '{' to last '}'.
3. Parse as JSON.
4. IF parse fails: log error in DECISIONS.md → force RETRY cycle.
```

</json_extraction_protocol>

---

<rules>

## 4. Strict Rules of Conduct

| Rule | Constraint |
|---|---|
| No developer emulation | Never touch Python, JS, or write tests |
| No questions | Execute A → B → C without user confirmation |
| Persistence first | Write every status change to disk BEFORE executing sub-agent command |

</rules>

---

<appendix>

## 5. File Templates & Examples

See [EXAMPLES.md](./EXAMPLES.md) for complete templates: `BACKLOG.md`, `DEVELOPMENT-STATE.md` and `DECISIONS.md`

</appendix>
