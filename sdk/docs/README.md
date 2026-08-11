# Project Documentation

Index of project technical documentation for **harness-kit SDK**. Use these links for document navigation and graph topology.

## DOCUMENTATION INDEX
| Document | Description | Reading |
|----------|-------------|----------|
| [**ARCHITECTURE.md**](./adr/ARCHITECTURE.md) | Architecture, folder organization, and code patterns for the project. | **Mandatory** |
| [**TESTS.md**](./adr/TESTS.md) | Testing strategies, patterns, and execution commands. | **Mandatory** |
| [**.digest.md**](./.digest.md) | Machine-readable project orientation digest (stack, test commands, rules). | **Mandatory** |
| [**.graph.json**](./.graph.json) | Machine-readable document relation graph index for agent topology navigation. | **Mandatory** |
| [**STEERING.md**](./adr/STEERING.md) | Session steering overrides and state machine rollbacks. | Optional |
| [**AGENT-RUNNERS.md**](./adr/AGENT-RUNNERS.md) | Outbound LLM runner strategies and dynamic registries. | Optional |
| [**TELEMETRY.md**](./adr/TELEMETRY.md) | Token ledger tracking, cost auditing, and rate limit halts. | Optional |
| [**STATE-PERSISTENCE.md**](./adr/STATE-PERSISTENCE.md) | FileState atomic writes and Markdown/JSON parsing. | Optional |
| [**SDK_CLI.md**](./feature/SDK_CLI.md) | CLI commands (`hrns init`, `run`, `report`), arg parsing, and interactive wizards. | Optional |
| [**SDK_AGENT_RUNNER.md**](./feature/SDK_AGENT_RUNNER.md) | Agent runner strategies, CLI flags (`--agent`, `--model`), and `AgentInvocation` interface. | Optional |
| [**SDK_SETTINGS.md**](./feature/SDK_SETTINGS.md) | Phase-specific model and effort settings per runner with OS-aware loading. | Optional |
| [**SDK_CORE.md**](./feature/SDK_CORE.md) | Architectural details of core SDK ports and adapters, and full public API table. | Optional |
| [**SDK_PACKAGE.md**](./feature/SDK_PACKAGE.md) | SDK package build and release configuration. | Optional |
| [**SDK_STATE.md**](./feature/SDK_STATE.md) | SDK state persistence and recovery logic. | Optional |
| [**SDK_STEERING.md**](./feature/SDK_STEERING.md) | Session steering: `SteeringAnalyzer`, `steeringRules` config, and rollback/rule actions. | Optional |
| [**SDK_TERMINAL_UI.md**](./feature/SDK_TERMINAL_UI.md) | Terminal progress spinner, progress bar, and ANSI color helpers. | Optional |
| [**HTTP_SERVER.md**](./feature/HTTP_SERVER.md) | Headless HTTP server daemon, REST endpoints, and Docker container support. | Optional |
| [**E2E_TESTING_SUITE.md**](./feature/E2E_TESTING_SUITE.md) | End-to-End integration and CLI test suite specifications and setup. | Optional |

## RECOMMENDED READING ORDER

If an exact path is supplied, read it directly. Otherwise use this order:

1. **.digest.md** — fast orientation (architecture, stack, test commands).
2. **.graph.json** — relation graph index for 1-hop document lookup.
3. **adr/ARCHITECTURE.md** — technical foundation and project organization.
4. **adr/TESTS.md** — code validation and quality.
5. Additional documents in adr/ or feature/ folders as needed for the task.
