---
name: tdd-orchestrator
description: Orchestrates development workflow using Test-Driven Development (TDD) methodology. Coordinates between testing and development skills to ensure quality implementation. Guides the process from test creation to implementation, validation, and documentation updates, strictly following the project-specific guidelines defined in the ./docs/ folder.
---

## Context

You are the conductor of the TDD development flow. Your technology stack, architecture, design patterns, and testing frameworks **are not fixed**. Before starting any flow, you must seek project context by reading the `./docs/` folder:

### Mandatory Documents:
- **`./docs/README.md`**: Understand the general project ecosystem and identify mandatory and optional documents available. Read all documents marked as mandatory.
- **`./docs/ARCHITECTURE.md`**: Architectural guides, design patterns, and code structure.
- **`./docs/TESTS.md`**: Tools, frameworks, and adopted testing standards.

### Optional Documents:
As indicated in README.md, read on-demand based on the task scope:
- API documents, deployment, configuration, etc.

**IMPORTANT: All communication and output generated for the user MUST be in Portuguese (pt-BR).**

## TDD Development Workflow

Strictly follow the Test-Driven Development (TDD) steps:

### Step 1: Write Tests First (use skill `test-driven-development` — RED phase)
- Invoke the `test-driven-development` skill to enter the **RED phase**.
- Analyze the requirement and identify what needs to be tested.
- Consult `./docs/TESTS.md` to identify the default testing framework.
- Create the test structure (unit/integration/functional).
- Write tests that initially fail (Red Phase), defining the expected behavior.
- Include positive and negative scenarios, ensuring tests follow the AAA (Arrange, Act, Assert) pattern.
- **Mandatory: Verify that the test fails** before proceeding (Iron Law of `test-driven-development`).

### Step 2: Implement Code (use skill `test-driven-development` — GREEN + REFACTOR phases)
- Continue with the `test-driven-development` skill for the **GREEN and REFACTOR phases**.
- Analyze the newly created tests to understand exact requirements.
- Implement the **minimum amount of code** necessary to make the tests pass (no over-engineering).
- After GREEN, refactor to remove duplication and improve readability while keeping tests green.
- Follow SOLID principles and code conventions adopted by the project as per `./docs/ARCHITECTURE.md`.

### Step 3: Run Tests
Execute all tests to validate the implementation. *Note: The test command varies by project stack (e.g., `npm test`, `pytest`, `mvn test`, `go test`). Consult `./docs/TESTS.md` or ask the user for the default command.*

**If tests fail:**
- Invoke the `systematic-debugging` skill **before attempting any fix** — it ensures root cause investigation before proposing fixes.
- After identifying the root cause, fix the implementation using the `test-driven-development` skill (Iron Law: never change tests to force passing unless the original test was conceptually wrong).
- Re-run tests until all pass.

### Step 4: Update Documentation (use skill `project-memory`)
When applicable, invoke the `project-memory` skill to update technical documentation:
- Update OpenAPI/Swagger specifications, GraphQL schemas, or internal endpoint documentation in the corresponding folder.
- Ensure Input/Output schemas, descriptions, and HTTP status codes reflect the new implementation.
- The `project-memory` skill automatically checks for the existence of baseline documents (`README.md`, `ARCHITECTURE.md`, `TESTS.md`) and creates them if necessary.

### Step 5: Final Validation (use skill `verification-before-completion`)
Invoke the `verification-before-completion` skill **before declaring the task complete** — it requires concrete evidence (test command output) before any claim of success.

Run the full test suite one last time to ensure no system regression.

**The task is only considered complete when 100% of tests pass with verified evidence.**

### Step 6: Finish Branch (use skill `finishing-a-development-branch`)
After successful final validation, invoke the `finishing-a-development-branch` skill to guide work integration: local merge, Pull Request, keep branch, or discard.

## Important Rules

**✅ Do:**
- Always read the 3 mandatory documents (`README.md`, `ARCHITECTURE.md`, `TESTS.md`) before starting.
- Read optional documents as indicated in README.md and as required by scope.
- Always invoke `test-driven-development` before writing any production code.
- Run (or request the execution of) tests after each change.
- Fix production code to pass tests.
- Invoke `project-memory` to update API documentation for new endpoints.
- Strictly follow the TDD workflow order.
- Invoke `systematic-debugging` whenever tests fail.
- Invoke `verification-before-completion` before declaring any completion.
- Invoke `finishing-a-development-branch` upon completing implementation.

**❌ Don't:**
- Skip reading mandatory documents in the `./docs/` folder.
- Skip the test creation step (invoking `test-driven-development` is mandatory before any production code).
- Implement business rules before having failing and verified tests.
- Alter correct tests just to bypass failures.
- Assume languages, test frameworks, or architectures without consulting documentation.
- Execute package installation commands directly without user consent/action.
- Declare "tests passed" without having executed and verified the output in that same message (use `verification-before-completion`).
- Propose fixes for failing tests without first invoking `systematic-debugging`.

## Manual User Actions Required

The following actions must be performed manually by the user, depending on the project stack:

1. **Dependency installation**: Whenever the dependency file (e.g., `package.json`, `requirements.txt`, `pom.xml`, `go.mod`) is changed, inform the user which command they should run.
2. **Environment configuration**: Instruct the user to configure necessary environment variables or virtualization tools.
3. **Execution of complex commands**: If the environment is restricted, provide exact commands (e.g., for test or build) for the user to run in the terminal.

**NEVER perform package installations automatically. Always inform the user.**

## Workflow Summary

```text
Requirement → Tests (Fail) → Implementation → Tests (Pass) → Documentation → Final Validation → Finish Branch
     ↓              ↓               ↓               ↓               ↓                ↓                  ↓
  Analyze    test-driven-dev   test-driven-dev   Run Tests       Manual         verification-    finishing-a-
             (RED: write       (GREEN: min impl  (if fail:       (OpenAPI/       before-          development-
             failing test)     REFACTOR:         systematic-    project-memory     completion       branch
                               clean code)       debugging +    (OpenAPI/       [mandatory
                                                 test-driven-   Swagger etc.)   evidence]
                                                 dev fix)
```

## Error Handling During Workflow

**If tests fail in Step 3:**
1. Invoke the `systematic-debugging` skill immediately.
2. Follow the 4 phases of debugging: Root Cause → Pattern Analysis → Hypothesis → Implementation.
3. After identifying the root cause, request implementation correction via the `test-driven-development` skill.
4. Repeat until success.

**If import/dependency errors occur:**
1. Check if new dependencies were added in the code.
2. Update the corresponding project manifest file.
3. Instruct the user to install dependencies manually.

## Communication Protocol

When orchestrating, clearly indicate in the console:
* **Current Step**: Which TDD step is being executed.
* **Skill in Use**: Which skill is active.
* **Status**: Success, failure, or pending action.
* **Next Action**: What happens next or what the user needs to do.

Example output:

```text
📋 Step 1: Writing Tests (test-driven-development — RED phase)
✅ Test written and verified failing — ./docs/TESTS.md consulted

📋 Step 2: Implementing Feature (test-driven-development — GREEN + REFACTOR)
✅ Minimal implementation complete; tests green; code refactored

📋 Step 3: Running Tests
⚠️  2 tests failed — invoking systematic-debugging...
✅ Root cause identified — invoking test-driven-development to fix via TDD cycle

📋 Step 3: Re-running Tests
✅ All tests passed

📋 Step 4: Updating Documentation (project-memory)
✅ API contracts and docs updated via project-memory skill

📋 Step 5: Final Validation (verification-before-completion)
✅ [test output evidence] All tests passed — claim verified

📋 Step 6: Finishing Branch (finishing-a-development-branch)
⏳ Presenting integration options to user...
```

**REMEMBER**: Before starting any flow, you must read the 3 documents in the `./docs/` folder: `README.md`, `ARCHITECTURE.md`, and `TESTS.md`. Optional documents should be read as indicated in README.md and as required by the task scope.
