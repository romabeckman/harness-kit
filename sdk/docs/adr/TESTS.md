# Testing Protocol

## OVERVIEW
Maintain high reliability of the SDK orchestrator core and runner strategies using fast isolated unit and integration tests.

## COMMANDS
| Type | Command | Description |
|------|---------|-------------|
| Unit & Integration | `rtk npm test` | Runs the full Vitest suite via RTK proxy. |
| Type Check | `rtk npm run typecheck` | Checks TypeScript compilation via RTK. |
| Build Check | `rtk npm run build` | Compiles and builds source code via RTK. |

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
FORBIDDEN: Testing using real external APIs in unit tests.
FORBIDDEN: Test suites that share state or depend on execution order.

## TOOLING
- **Framework:** Vitest 1.6.0
- **Assertions:** Vitest built-in expect
- **Mocks/Stubs:** Vitest mock utilities
- **Coverage:** V8 coverage reporter
- **CI Integration:** PrepublishOnly lifecycle hook runs npm test

## TROUBLESHOOTING
- **Flaky tests:** Reset mock states using beforeEach and restoreAllMocks.
- **Debug mode:** Run `rtk npx vitest` to watch and interactively debug tests.
