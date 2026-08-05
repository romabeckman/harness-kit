---
doc_type: feature
domain: e2e_testing
stack: [TypeScript, Vitest 1.6.0, Node.js, Execa]
depends_on: [ARCHITECTURE.md, TESTS.md, sdk_cli.md, sdk_core.md]
updated: 2026-08-04
---
# End-to-End (E2E) Testing Suite

Provides an end-to-end integration and CLI test suite validating the complete Harness Kit SDK (`hrns`) orchestrator lifecycle, CLI options, state disk mutations, multi-project steering, telemetry dashboard rendering, and error recovery behaviors.

## OVERVIEW

The E2E testing suite executes non-interactive end-to-end test scenarios against compiled CLI binaries (`dist/cli/run.js`). It leverages Vitest with dedicated configuration, temporary file sandboxes, and configurable mock agent CLI stubs to verify orchestrator state transitions, atomic disk updates in `docs/product/`, session steering rollbacks, multi-project read-only safety, telemetry logs, and quota recovery.

## FOLDER STRUCTURE

```
tests/
└── e2e/
    ├── helpers/
    │   ├── SandboxEnvironment.ts    # Temporary folder isolation and cleanup (/tmp/hrns-e2e-*)
    │   ├── MockAgentCli.ts          # Subprocess stub for simulating agent behavior & scores
    │   └── AssertionHelpers.ts      # Disk state validators for BACKLOG and BOOTSTRAP-CONFIG
    ├── scenarios/
    │   ├── 01-init-and-bootstrap.test.ts
    │   ├── 02-full-orchestration-cycle.test.ts
    │   ├── 03-session-resume-and-steering.test.ts
    │   ├── 04-multi-project-readonly-steering.test.ts
    │   ├── 05-report-dashboard-and-telemetry.test.ts
    │   └── 06-quota-exceeded-and-halt-recovery.test.ts
    └── vitest.e2e.config.ts         # Dedicated Vitest runner configuration (30s timeout)
```

## E2E SCENARIOS & COMPONENTS

### Scenario Infrastructure
- **`SandboxEnvironment`**: Spawns isolated execution environments in temporary system directories to prevent side effects across test runs.
- **`MockAgentCli`**: Intercepts agent runner subprocess calls to return predefined TDD responses, Tech Lead scores, and Adversarial QA verdicts.
- **`AssertionHelpers`**: Asserts atomic state file integrity across `docs/product/BACKLOG.md`, `DECISIONS.md`, and `BOOTSTRAP-CONFIG.json`.

### Functional Scenarios
1. **Workspace Initialization (`01-init-and-bootstrap.test.ts`)**: Validates interactive and headless `hrns init` execution, establishing product file structures and steering rules.
2. **Full Autonomous Orchestration (`02-full-orchestration-cycle.test.ts`)**: Validates state machine phase transitions (`BOOTSTRAP` -> `PLANNING` -> `DEVELOPMENT` -> `REVIEW` -> `STATE_CHECK` -> `MEMORY`) and backlog item completion.
3. **Interruption, Resume & Steering (`03-session-resume-and-steering.test.ts`)**: Tests session recovery via `hrns run --resume`, dynamic phase rollbacks, and runtime injection of developer steering rules.
4. **Multi-Project Read-Only Steering (`04-multi-project-readonly-steering.test.ts`)**: Ensures global steering constraints prevent modifications to specified read-only project paths while allowing target writes.
5. **Telemetry & Dashboard Report (`05-report-dashboard-and-telemetry.test.ts`)**: Verifies idempotent read-only execution of `hrns report` and accurate cost auditing from `tokens.jsonl`.
6. **Quota Exceeded & POC Recovery (`06-quota-exceeded-and-halt-recovery.test.ts`)**: Validates graceful orchestration halt on HTTP 429 / rate limits and permissive threshold handling under POC mode (`--score 0.6 --reworks 1`).

## HOW TO RUN E2E TESTS

### Prerequisites
1. Compiled SDK CLI build (`dist/cli/run.js` must exist via `npm run build`).
2. Node.js environment with Vitest installed.

### Execution Command

```bash
# Execute full E2E test suite
rtk npm run test:e2e
```

<code_example>
# CORRECT: Running E2E suite after building the binary
rtk npm run build && rtk npm run test:e2e

# WRONG: Running E2E suite on uncompiled source code
rtk npm run test:e2e
</code_example>

## PARAMETERS / CONFIGURATIONS

| Parameter | Location | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `testTimeout` | `tests/e2e/vitest.e2e.config.ts` | int | 30000 | Timeout in milliseconds for long-running E2E CLI processes |
| `include` | `tests/e2e/vitest.e2e.config.ts` | string[] | `['tests/e2e/scenarios/**/*.test.ts']` | Glob pattern for E2E scenario files |

## BEST PRACTICES

REQUIRED: Always clean up sandbox directories after test completion using `afterEach` or `afterAll` hooks.
REQUIRED: Execute CLI processes against compiled output (`dist/cli/run.js`) rather than source TS files to mirror real distribution execution.
FORBIDDEN: Modifying workspace root source or production configuration during E2E test execution.

## REFERENCES

- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Core architectural layers and CLI runner patterns.
- [**TESTS.md**](../adr/TESTS.md): Overall test strategies, coverage targets, and execution standards.
- [**sdk_cli.md**](./sdk_cli.md): CLI command flag definitions and interactive wizard specifications.
