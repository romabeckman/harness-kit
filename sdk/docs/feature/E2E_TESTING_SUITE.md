---
doc_type: feature
domain: e2e_testing
stack: [TypeScript, Vitest 1.6.0, Node.js, Execa]
depends_on: [ARCHITECTURE.md, TESTS.md, SDK_CLI.md, SDK_CORE.md]
updated: 2026-08-04
---
# END-TO-END (E2E) TESTING SUITE
Provides an end-to-end integration and CLI test suite validating the complete Harness Kit SDK orchestrator lifecycle.

## OVERVIEW
The E2E testing suite executes non-interactive end-to-end test scenarios against compiled CLI binaries (`dist/cli/run.js`). It leverages Vitest with dedicated configuration to verify orchestrator state transitions and safety constraints.

## FOLDER STRUCTURE
<folder_structure>
```
tests/e2e/
├── helpers/
│   ├── SandboxEnvironment.ts    # Temporary folder isolation and cleanup
│   ├── MockAgentCli.ts          # Subprocess stub for simulating agent behavior
│   └── AssertionHelpers.ts      # Disk state validators
├── scenarios/
│   ├── 01-init-and-bootstrap.test.ts
│   ├── 02-full-orchestration-cycle.test.ts
│   ├── 03-session-resume-and-steering.test.ts
│   ├── 04-multi-project-readonly-steering.test.ts
│   ├── 05-report-dashboard-and-telemetry.test.ts
│   └── 06-quota-exceeded-and-halt-recovery.test.ts
└── vitest.e2e.config.ts         # Dedicated Vitest runner configuration
```
</folder_structure>

## E2E SCENARIOS & COMPONENTS

### Scenario Infrastructure
- **`SandboxEnvironment`**: Spawns isolated execution environments in temporary system directories.
- **`MockAgentCli`**: Intercepts agent runner subprocess calls to return predefined TDD responses.
- **`AssertionHelpers`**: Asserts atomic state file integrity.

## HOW TO RUN E2E TESTS

### Prerequisites
1. Compile SDK CLI build (`dist/cli/run.js` must exist via `npm run build`).
2. Install Vitest in Node.js environment.

### Steps
1. Navigate to the project root.
2. Execute the test runner command.

<code_example>
# CORRECT: Running E2E suite after building the binary
rtk npm run build && rtk npm run test:e2e

# WRONG: Running E2E suite on uncompiled source code
rtk npm run test:e2e
</code_example>

## PARAMETERS / CONFIGURATIONS

| Name | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| testTimeout | int | Yes | Timeout in milliseconds for long-running E2E CLI processes | 30000 |
| include | string[] | Yes | Glob pattern for E2E scenario files | `['tests/e2e/scenarios/**/*.test.ts']` |

## BEST PRACTICES
REQUIRED: Clean up sandbox directories after test completion using hooks.
REQUIRED: Execute CLI processes against compiled output rather than source TS files.
PROHIBITED: Modifying workspace root source or production configuration during E2E test execution.

## REFERENCES
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Core architectural layers and CLI runner patterns.
- [**TESTS.md**](../adr/TESTS.md): Overall test strategies, coverage targets, and execution standards.
- [**SDK_CLI.md**](./SDK_CLI.md): CLI command flag definitions and interactive wizard specifications.

---

## CHANGE SUMMARY
- **Added:** YAML frontmatter, CHANGE SUMMARY section.
- **Updated:** Section titles converted to uppercase, adjusted rules format.
- **Removed:** Introductory filler text.
