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
| [**sdk_cli.md**](./feature/sdk_cli.md) | CLI commands (`hrns init`, `run`, `report`), arg parsing, and interactive wizards. | Optional |
| [**sdk_agent_runner.md**](./feature/sdk_agent_runner.md) | Agent runner strategies, CLI flags (`--agent`, `--model`), and `AgentInvocation` interface. | Optional |
| [**sdk_settings.md**](./feature/sdk_settings.md) | Phase-specific model and effort settings per runner with OS-aware loading. | Optional |
| [**sdk_core.md**](./feature/sdk_core.md) | Architectural details of core SDK ports and adapters, and full public API table. | Optional |
| [**sdk_package.md**](./feature/sdk_package.md) | SDK package build and release configuration. | Optional |
| [**sdk_state.md**](./feature/sdk_state.md) | SDK state persistence and recovery logic. | Optional |
| [**sdk_steering.md**](./feature/sdk_steering.md) | Session steering: `SteeringAnalyzer`, `steeringRules` config, and rollback/rule actions. | Optional |
| [**sdk_terminal_ui.md**](./feature/sdk_terminal_ui.md) | Terminal progress spinner, progress bar, and ANSI color helpers. | Optional |

## RECOMMENDED READING ORDER

1. **adr/ARCHITECTURE.md** — technical foundation and project organization.
2. **adr/TESTS.md** — code validation and quality.
3. Additional documents in adr/ or feature/ folders as needed for the task.
