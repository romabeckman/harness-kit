---
name: tdd-orchestrator
description: Orchestrates development workflow using Test-Driven Development (TDD) methodology. Coordinates between testing and development skills to ensure quality implementation. Guides the process from test creation to implementation, validation, and documentation updates, strictly following the project-specific guidelines defined in the ./docs/ folder.
---

<execution_mode>

## Mode Detection — Resolve Before Anything Else

```
IF invoked by autonomous-orchestrator:
    mode = AUTONOMOUS
    → Read ${featureId}, ${domain}, ${projectPaths} from runtime context
    → Skip all interactive prompts
    → Use docs/specs/${domain}/ as single source of truth

IF invoked directly by human:
    mode = INTERACTIVE
    → Follow prompts and manual verification gates normally
```

</execution_mode>

---

<context>

## Project Context — Read Before Starting Any Flow

### Mandatory documents (always):

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

### Optional documents:
Read on-demand as indicated in `README.md` (API specs, deployment, configuration, etc.).

</context>

---

<workflow>

## TDD Workflow — Execute Steps in Order

<step id="1" name="Write Tests — RED Phase" skill="test-driven-development">

```
AUTONOMOUS → translate each Given-When-Then from 004-*-test-scenarios.md into executable test code
INTERACTIVE → analyze requirement and identify what needs to be tested
```

- Consult `docs/adr/TESTS.md` for the default testing framework
- Create test structure (unit / integration / functional)
- Write tests following AAA pattern (Arrange, Act, Assert)
- Include positive and negative scenarios
- **REWORK (if `REWORK-LOG.md` present)**: translate each vulnerability and missed edge case from `REWORK-LOG.md` into new failing test cases to ensure regression protection
- **IRON LAW: verify test FAILS before proceeding**

</step>

<step id="2" name="Implement Code — GREEN + REFACTOR Phases" skill="test-driven-development">

```
AUTONOMOUS → follow ordered tasks from 003-*-tactical-design.md as implementation blueprint
INTERACTIVE → analyze newly created tests to understand exact requirements
```

- Implement **minimum code** to make tests pass — no over-engineering
- **REWORK (if `REWORK-LOG.md` present)**: address all architectural questions, vulnerabilities, and open points listed in `REWORK-LOG.md` alongside tactical tasks
- After GREEN: refactor to remove duplication and improve readability
- Keep tests green throughout refactor
- Follow SOLID principles and conventions from `docs/adr/ARCHITECTURE.md`

</step>

<step id="3" name="Run Tests">

Execute full test suite. *(Command varies by stack — consult `docs/adr/TESTS.md`. Examples: `npm test`, `pytest`, `mvn test`, `go test`.)*

```
IF all tests pass → proceed to Step 4

IF any test fails:
    1. Invoke systematic-debugging skill BEFORE attempting any fix
    2. Follow 4 debugging phases: Root Cause → Pattern Analysis → Hypothesis → Implementation
    3. Fix production code via test-driven-development skill
       IRON LAW: never change tests to force passing unless test was conceptually wrong
    4. Re-run tests → repeat until all pass
```

</step>

<step id="4" name="Final Validation" skill="verification-before-completion">

- Invoke `verification-before-completion` **before declaring any completion**
- Run full test suite one last time — check for regressions
- Provide concrete evidence (actual test command output)

```
Task is COMPLETE only when: 100% tests pass WITH verified output evidence
```

</step>

<step id="5" name="Update Documentation" skill="project-memory">

When applicable, invoke `project-memory` to update:
- OpenAPI/Swagger specs, GraphQL schemas, internal endpoint docs
- Input/Output schemas, descriptions, HTTP status codes
- The `docs/feature/{FEATURE_NAME}.md` file must be updated whenever a feature is created or updated.

> `project-memory` auto-creates baseline docs (`README.md`, `docs/adr/ARCHITECTURE.md`, `docs/adr/TESTS.md`) if missing.

</step>

<step id="6" name="Machine-Readable Output">

Only necessary for AUTONOMOUS mode. If using INTERACTIVE mode, skip this step. 

In the case of AUTONOMOUS, save the structured JSON in `docs/specs/${domain}/TDD-OUTPUT.json`:

```json
{
  "featureId": "string",
  "status": "SUCCESS" | "FAILED",
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

</step>

</workflow>

---

<rules>

## Rules of Conduct

**✅ Do:**
- Read the 3 mandatory docs before starting (`README.md`, `ARCHITECTURE.md`, `TESTS.md`)
- Invoke `test-driven-development` before writing any production code
- Run tests after every change
- Fix production code — never alter correct tests to force passing
- Invoke `verification-before-completion` before declaring completion
- Invoke `project-memory` for new or changes in the project

**❌ Don't:**
- Skip mandatory docs in `docs/adr/`
- Write production code before having failing, verified tests
- Assume language, framework, or architecture without consulting docs
- Run package installation commands automatically — always instruct the user
- Declare "tests passed" without executed, verified output in the same message
- Propose fixes for failing tests without first invoking `systematic-debugging`

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

At each step, emit a status block:

```
📋 Step {N}: {Step Name} ({skill} — {phase})
✅ / ⚠️ / ❌  {outcome or next action}
```

**Example sequence:**
```
📋 Step 1: Writing Tests (test-driven-development — RED)
✅ Tests written and verified failing — TESTS.md consulted

📋 Step 2: Implementing Feature (test-driven-development — GREEN + REFACTOR)
✅ Minimal implementation complete; tests green; code refactored

📋 Step 3: Running Tests
⚠️  2 tests failed — invoking systematic-debugging...
✅ Root cause identified — fixing via test-driven-development

📋 Step 3: Re-running Tests
✅ All tests passed

📋 Step 4: Final Validation (verification-before-completion)
✅ [test output evidence] All tests passed — claim verified

📋 Step 5: Updating Documentation (project-memory)
✅ API contracts updated

📋 Step 6: Machine-Readable Output
✅ JSON report generated
```

</communication_protocol>