---
doc_type: adr
domain: testing
stack: [vitest, typescript]
node_id: "adr:tests"
tags: [testing, vitest, unit-tests, e2e-tests, coverage]
edges: []
updated: "2026-08-08"
---
# Testing Protocol

## OVERVIEW
Maintain high reliability of the SDK orchestrator core and runner strategies using fast isolated unit and integration tests.

## COMMANDS
| Type | Command | Description |
|------|---------|-------------|
| Unit & Integration | `rtk npm test` | Runs the full Vitest suite via RTK proxy. |
| End-to-End (E2E) | `rtk npm run test:e2e` | Runs E2E scenarios via dedicated Vitest config (`tests/e2e/vitest.e2e.config.ts`). |
| Type Check | `rtk npm run typecheck` | Checks TypeScript compilation via RTK. |
| Build Check | `rtk npm run build` | Compiles and builds source code via RTK. |
| Coverage | `rtk npx vitest --coverage` | Runs coverage provider. |

## MINIMUM COVERAGE
REQUIRED: Maintain the following minimum coverage levels:

| Layer | Coverage | Description |
|-------|----------|-------------|
| Domain / Core | 90% | Business logic and invariants |
| Application / Use Cases | 85% | Orchestration and flows |
| Infrastructure / Adapters | 80% | External integrations and persistence |
| Global | 85% | Average total coverage |

## PATTERNS & BEST PRACTICES
REQUIRED: Follow AAA (Arrange, Act, Assert) pattern.
REQUIRED: Mock external boundaries like CLI spawn and remote API calls.
REQUIRED: Execute all test and build operations through the Rust Token Killer (RTK) proxy to optimize and track token savings.
REQUIRED: Isolate E2E tests using isolated temporary sandbox environments (`tests/e2e/helpers/SandboxEnvironment.ts`) and mock agent CLI subprocess stubs (`MockAgentCli.ts`).
FORBIDDEN: Testing using real external APIs in unit tests.
FORBIDDEN: Test suites that share state or depend on execution order.

## TOOLING
- **Framework:** Vitest 1.6.0 (E2E config: `tests/e2e/vitest.e2e.config.ts` with 30s timeout)
- **Assertions:** Vitest built-in expect and custom E2E validators (`AssertionHelpers.ts`)
- **Mocks/Stubs:** Vitest mock utilities and `MockAgentCli` stub generator
- **Coverage:** V8 coverage reporter
- **CI Integration:** PrepublishOnly lifecycle hook and `.github/workflows/ci.yml` pipeline step `npm run test:e2e`

## TROUBLESHOOTING
- **Flaky tests:** Reset mock states using beforeEach and restoreAllMocks.
- **Debug mode:** Run `rtk npx vitest` to watch and interactively debug tests.

## REFERENCES
- [**ARCHITECTURE.md**](./ARCHITECTURE.md): System architecture, layers, and code patterns.
- [**E2E_TESTING_SUITE.md**](../feature/E2E_TESTING_SUITE.md): End-to-End integration and CLI test suite specification.
