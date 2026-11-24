---
name: tdd-orchestrator
description: Orchestrates development workflow using Test-Driven Development (TDD) methodology. Coordinates between testing and development skills to ensure quality implementation. Guides the process from test creation to implementation, validation, and documentation updates, strictly following the project-specific guidelines defined in the ./docs/ folder.
---

<execution_mode>

## Mode Detection — Resolve Before Anything Else

```
IF invoked by autonomous-orchestrator or explicitly requested to run in autonomous mode:
    mode = AUTONOMOUS
    → Read ${featureId}, ${domain}, ${projectPaths}, and ${tasks} from runtime context (or prompt if standalone)
    → Skip all interactive prompts
    → Use docs/specs/${domain}/ as single source of truth

OTHERWISE (default, when invoked directly by human):
    mode = INTERACTIVE
    → Follow prompts and manual verification gates normally
```

</execution_mode>

---

<context>

## Project Context — Read Before Starting Any Flow

### Fast-path Orientation (check first):

| Document | Purpose |
|---|---|
| `docs/.digest.md` | Executive summary of architecture pattern, layers, test framework, run commands, coverage thresholds |
| `docs/.graph.json` | Complete relation graph index for 1-hop document lookup and dependency traversal |

*Note: If `docs/.digest.md` is present and provides complete stack/test commands, proceed directly. Fall back to reading full baseline documents below if `.digest.md` is missing or deeper technical context is required.*

### Feature micrograph routing

After macro orientation:

1. Match `${featureId}` and `${domain}` against `.graph.json` node IDs, titles, paths, and tags.
2. Resolve the selected feature node's `related_docs`:
   - Read every document in `must_read`.
   - Evaluate each `optional[].description` against `${tasks}`, current requirements, and rework findings when present.
   - Read only optional documents whose condition applies.
3. Resolve document paths through `.graph.json` `nodes[]`.
4. Start with frontmatter and the top `graph` block of the selected document under `docs/feature/`.
5. Validate every routed path exists. If any path is stale or feature node is absent, use `rg --files` plus targeted `rg` searches, then continue with discovered paths.
6. RED phase: read relevant `test_files` first.
7. GREEN phase: read relevant files in this order: `entrypoints`, `registration_files`, `reference_files`, then `code_files`.
8. Read full feature prose only when implementation needs design context not present in digest, graph, specs, or routed code.

### Published guidance before RED

In both modes, after routing to the affected feature and loading the applicable requirements, look only for its top-level `## RED guidance` section outside fenced examples. Also recognize the legacy heading `## Orientações para o RED`; treat both headings as duplicate sections if both exist. Look in the owning project when a workspace contains several projects. No feature, section, or usable entry means the normal RED proceeds. The [published orientation contract](../project-dreaming/references/CONTRACTS.md#published-orientation) applies when the section exists. Flag malformed guidance with its document locator and proceed from the applicable specification. The feature document is the source for guidance. Project Dreaming owns learning history and candidate evaluation.

For each entry relevant to the selected tasks, check its condition, exception, current source support, and existing tests. For a supported, in-scope rule, equivalent coverage takes the `covered` branch. Use each entry only for a concrete test decision:

- `applied` — materialize or adjust a test to cover the applicable scenario. In autonomous mode keep its original `004` scenario ID and respect the intent and task boundaries in `003` and `004`.
- `covered` — point to equivalent coverage, run it, and reuse it. Check equivalence against the task, including state setup, instance boundary, and assertions where relevant.
- `skipped` — continue with the applicable contract when the exception holds or the source is stale, missing, or contradicted. Record the source locator for later review when support has lapsed.
- `needs_refinement` — for a material ambiguity requiring a business decision, ask in interactive mode. In autonomous mode return any required new or contradictory behavior to refinement with its task/scenario and source. Continue independent, specified work; keep unresolved work incomplete. Existing autonomous acceptance and failed-output gates still apply.

Follow the usual RED requirement for new behavior and uncovered regressions. Reusing a test requires evidence that it checks the needed behavior. A currently green reused test is evidence of coverage, never a fabricated RED.

Capture the observed decision before acting on it, including when it leads to refinement. Link it to test execution evidence when the test runs.

Do not copy routing arrays into `.graph.json` or create another routing artifact.

### Baseline documents (fallback / deep-dive):

| Document | Purpose |
|---|---|
| `docs/README.md` | Project ecosystem overview; identifies mandatory vs optional docs |
| `docs/adr/ARCHITECTURE.md` | Architectural guides, design patterns, code structure |
| `docs/adr/TESTS.md` | Testing tools, frameworks, and adopted standards |

### Mandatory documents (Autonomous Mode only):

| Document | Purpose |
|---|---|
| `docs/specs/${domain}/003-*-tactical-design.md` | Ordered dev tasks, aggregates, value objects, domain services, persistence interfaces — **implementation blueprint** |
| `docs/specs/${domain}/004-*-test-scenarios.md` | Pre-specified unit/integration/functional scenarios — **drives RED phase; do not invent test cases** |
| `docs/specs/${domain}/REWORK-LOG.md` | Present only on retry — findings from previous validation to address |

### Related documents:
Use the selected feature node's `related_docs` from `.graph.json`.

- `must_read`: always load before implementation.
- `optional`: load only when its `description` matches the current task or rework context.
- Do not load unrelated optional documents.

</context>

---

<retry_fast_path>

## RETRY FAST-PATH (when REWORK-LOG.md exists)

REQUIRED: When `docs/specs/${domain}/REWORK-LOG.md` is present, apply these optimizations:
1. Read `REWORK-LOG.md` FIRST — extract all findings before any other action
2. Prioritize Step 1 (RED) after the scoped guidance check — confirm equivalent coverage or write failing tests for uncovered findings within the specified scope
3. SKIP Step 5 (Update Documentation) until final validation passes
4. SKIP Step 6 (Machine-Readable Output) until all tests pass — regenerate only at the end

</retry_fast_path>

---

<workflow>

## TDD Workflow — Execute Steps in Order

<step id="1" name="Write Tests — RED Phase">

```
AUTONOMOUS → translate the Given-When-Then scenarios relevant to `${tasks}` into executable test code
INTERACTIVE → analyze requirement and identify what needs to be tested
```

- Use test framework and commands from `.digest.md`; consult `docs/adr/TESTS.md` only when digest detail is missing or ambiguous
- Create test structure (unit / integration / functional)
- Write tests following AAA pattern (Arrange, Act, Assert)
- Include positive and negative scenarios
- **REWORK (if `REWORK-LOG.md` present)**: verify regression coverage for each finding and write a failing test where it is missing
- **IRON LAW: verify test FAILS before proceeding**

</step>

<step id="2" name="Implement Code — GREEN + REFACTOR Phases">

```
AUTONOMOUS → implement only `${tasks}`, following their order and dependencies in 003-*-tactical-design.md
INTERACTIVE → analyze newly created tests to understand exact requirements
```

- Implement **minimum code** to make tests pass — no over-engineering
- **REWORK (if `REWORK-LOG.md` present)**: address all architectural questions, vulnerabilities, and open points listed in `REWORK-LOG.md` alongside tactical tasks
- After GREEN: refactor to remove duplication and improve readability
- Keep tests green throughout refactor
- Follow constraints from `.digest.md`; consult `docs/adr/ARCHITECTURE.md` only when work crosses architectural boundaries or digest detail is insufficient

</step>

<step id="3" name="Run Tests">

Execute full test suite using verified command from `.digest.md`; fall back to `docs/adr/TESTS.md` when unavailable.

```
IF all tests pass → proceed to Step 4

IF any test fails:
    1. Route diagnosis to the developer-debugging agent BEFORE attempting any fix
    2. Follow 4 debugging phases: Root Cause → Pattern Analysis → Hypothesis → Implementation
    3. Fix production code through this tdd-orchestrator RED/GREEN/REFACTOR workflow
       IRON LAW: never change tests to force passing unless test was conceptually wrong
    4. Re-run tests → repeat until all pass
```

</step>

<step id="4" name="Final Validation">

- Execute this final validation gate **before declaring any completion**
- Run full test suite one last time — check for regressions
- Provide concrete evidence (actual test command output)
- When recording a trace, pass the observed guidance decisions and corresponding test evidence to `harness-tracer`. In a direct session without a trace, report the feature, guidance ID and revision, decision, scenario or test locator, and observed command/result so a subsequent Dreaming review can cite them.

```
Task is COMPLETE only when: 100% tests pass WITH verified output evidence
```

</step>

<step id="5" name="Update Documentation">

In INTERACTIVE mode, after final validation, check the task, trace and guidance decisions already in context. If the task met a known hypothesis review trigger or verified evidence contradicts a published orientation, invoke `project-dreaming` once for the owning project and feature before `project-memory`. Supply the hypothesis or orientation ID, matched condition, evidence locator and observed result. A normal pass or an expected `skip_when` is insufficient. Do not scan the learning queue to discover a trigger. Forward any grounded handoff with the ordinary documentation update. In AUTONOMOUS mode, carry the signal and locator in the developer handoff for independent review.

INTERACTIVE mode only: when applicable, invoke `project-memory` to update:
- OpenAPI/Swagger specs, GraphQL schemas, internal endpoint docs
- Input/Output schemas, descriptions, HTTP status codes
- The `docs/feature/{FEATURE_NAME}.md` file must be updated whenever a feature is created or updated.

> `project-memory` auto-creates baseline docs (`README.md`, `docs/adr/ARCHITECTURE.md`, `docs/adr/TESTS.md`) if missing.

If Dreaming supplied a publication or withdrawal handoff, return the receipt to Dreaming for verification and closure of that ID. An unresolved operation keeps its retry trigger.

</step>

<step id="6" name="Machine-Readable Output">

Only necessary for AUTONOMOUS mode. If using INTERACTIVE mode, skip this step. 

In the case of AUTONOMOUS, save the structured JSON in `docs/specs/${domain}/TDD-OUTPUT.json`:

```json
{
  "featureId": "string",
  "status": "SUCCESS",
  "metrics": {
    "totalTests": 0,
    "passed": 0,
    "failed": 0,
    "coverage": 0.00
  },
  "modifiedFiles": [
    "relative/path/to/modified/file1.ts",
    "relative/path/to/modified/file2.py"
  ],
  "reworksCount": 0
}
```

`status` must be either `"SUCCESS"` or `"FAILED"`. Write `"SUCCESS"` only after the requested work is complete and the final test run has zero failures. If a required scenario is pending refinement, keep that task incomplete and report `"FAILED"` if writing an output.

Preserve caller-required fields. The skill-driven `autonomous-orchestrator` expects `developerHandoff` of at most 500 characters. When the guidance lookup was observed, add the optional [`orientation_use` array](../project-dreaming/references/CONTRACTS.md#tdd-use). Preserve scenario IDs and reference verified execution evidence in the run/trace. Older reports without the field remain usable. Supply decisions to the trace while session evidence is available, since an autonomous review may later remove the transient TDD output.

</step>

</workflow>

---

<rules>

## Rules of Conduct

**✅ Do:**
- Read `docs/.digest.md` and `docs/.graph.json` first if present; select one feature micrograph and follow its role-based paths before broad search
- Verify routed files exist; use targeted `rg` discovery when metadata is stale or missing
- Follow this skill's RED phase before writing any production code
- Run tests after every change
- Fix production code — never alter correct tests to force passing
- Execute the final validation step before declaring completion
- In interactive mode, invoke `project-memory` for project documentation updates

**❌ Don't:**
- Skip mandatory orientation context or baseline docs in `docs/adr/`
- Write production code before having failing, verified tests
- Assume language, framework, or architecture without consulting docs
- Run package installation commands automatically — always instruct the user
- Declare "tests passed" without executed, verified output in the same message
- Propose fixes for failing tests without first routing root-cause analysis to `developer-debugging`

</rules>

---

<manual_actions>

## Manual User Actions

The following must always be performed by the user — **never automate these**:

| Trigger | Action Required |
|---|---|
| Dependency file changed (`package.json`, `requirements.txt`, `pom.xml`, `go.mod`) | Inform user of the install command to run |
| New environment variables or virtualization needed | Instruct user to configure them |
| Restricted environment | Provide exact terminal commands for user to execute |

</manual_actions>

---

<communication_protocol>

## Console Output Format

In INTERACTIVE mode, emit a status block at each step. In AUTONOMOUS mode, keep console output minimal and rely on `TDD-OUTPUT.json` as the machine-readable result.

```
📋 Step {N}: {Step Name} ({skill} — {phase})
✅ / ⚠️ / ❌  {outcome or next action}
```

**Example sequence:**
```
📋 Step 1: Writing Tests (tdd-orchestrator — RED)
✅ Tests written and verified failing — TESTS.md consulted

📋 Step 2: Implementing Feature (tdd-orchestrator — GREEN + REFACTOR)
✅ Minimal implementation complete; tests green; code refactored

📋 Step 3: Running Tests
⚠️  2 tests failed — routing diagnosis to developer-debugging...
✅ Root cause identified — fixing via tdd-orchestrator

📋 Step 3: Re-running Tests
✅ All tests passed

📋 Step 4: Final Validation (tdd-orchestrator)
✅ [test output evidence] All tests passed — claim verified

📋 Step 5: Updating Documentation (project-memory)
✅ API contracts updated

📋 Step 6: Machine-Readable Output
✅ JSON report generated
```

</communication_protocol>
