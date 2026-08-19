---
doc_type: adr
domain: testing
stack: [Vitest 4.1.10, TypeScript 7.0.2, V8 coverage]
node_id: "adr:tests"
tags: [testing, vitest, unit-tests, e2e-tests, coverage]
edges: []
updated: "2026-08-18"
---
# Testing Protocol

## OVERVIEW
Use **Vitest 4.1.10** for unit, integration, and E2E validation. Keep external agent calls mocked and isolate filesystem-heavy E2E scenarios in temporary sandboxes.

## COMMANDS

| Type | Command | Description |
|---|---|---|
| Dependencies | `rtk npm install` | Verify lockfile dependencies and audit result. |
| Lint | `rtk npm run lint` | Check TypeScript and test syntax with ESLint. |
| Build | `rtk npm run build` | Compile publishable output before typecheck. |
| Typecheck | `rtk npm run typecheck` | Run TypeScript without emitting files. |
| Unit and integration | `rtk npm run test` | Run default Vitest discovery. |
| E2E | `rtk npm run test:e2e` | Run `tests/e2e/**/*.test.ts` with a 30-second timeout. |
| Coverage | `rtk npx vitest run --coverage` | Produce V8 coverage reports. |

## MINIMUM COVERAGE

ALLOWED: Measure coverage with `@vitest/coverage-v8`.
PROHIBITED: Claim or enforce numeric coverage thresholds until a repository configuration or CI gate defines them.

## PATTERNS & BEST PRACTICES

REQUIRED: Follow **Arrange, Act, Assert** and keep tests independent.
REQUIRED: Mock agent SDKs, CLI subprocesses, network calls, clocks, and environment boundaries.
REQUIRED: Use `tests/e2e/helpers/SandboxEnvironment.ts` for isolated E2E workspaces.
REQUIRED: Use `tests/e2e/helpers/MockAgentCli.ts` instead of real agent execution.
PROHIBITED: Depend on suite execution order or shared mutable state.
PROHIBITED: Call real external APIs from unit or integration tests.

## TOOLING

- **Framework and assertions:** Vitest 4.1.10 with built-in `expect`.
- **Mocks and stubs:** Vitest mocks plus `FakeAgentRunner` and `MockAgentCli` helpers.
- **Coverage:** `@vitest/coverage-v8` 4.1.10; no numeric gate configured.
- **E2E configuration:** `vitest.e2e.config.ts`; include `tests/e2e/**/*.test.ts`, use 30-second test and hook timeouts.
- **Release gate:** `prepublishOnly` runs build and default tests; no repository-local CI workflow exists.

## TROUBLESHOOTING

- **Flaky tests:** Restore mocks and environment values in `afterEach`; isolate temporary paths per test.
- **Focused run:** Use `rtk npx vitest run <path>` for one file.
- **Interactive debug:** Use `rtk npm run test:watch`.
- **E2E cleanup:** Use `rtk npm run test:e2e:clean` after interrupted sandbox runs.

## REFERENCES

- [**README.md**](../README.md): Main documentation index.
- [**ARCHITECTURE.md**](./ARCHITECTURE.md): System layers, boundaries, and integration patterns.
