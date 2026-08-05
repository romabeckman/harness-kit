# Project Documentation

Index of project technical documentation for **harness-kit SDK**. Use the links below to navigate the available documents.

## DOCUMENTATION INDEX
**RULE:** Only reference documents located in `./docs/adr/` or `./docs/feature/`. No other folders are permitted. Always validate that referenced files exist in one of these directories before finalizing the document.

| Document | Description | Reading |
|----------|-------------|----------|
| [**ARCHITECTURE.md**](./adr/ARCHITECTURE.md) | Architecture, folder organization, and code patterns for the project. | **Mandatory** |
| [**TESTS.md**](./adr/TESTS.md) | Testing strategies, patterns, and execution commands. | **Mandatory** |
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
| [**E2E_TESTING_SUITE.md**](./feature/E2E_TESTING_SUITE.md) | End-to-End integration and CLI test suite specifications and setup. | Optional |

## RECOMMENDED READING ORDER

1. **adr/ARCHITECTURE.md** — technical foundation and project organization.
2. **adr/TESTS.md** — code validation and quality.
3. Additional documents in adr/ or feature/ folders as needed for the task.
