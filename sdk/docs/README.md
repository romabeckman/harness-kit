# Project Documentation

Index of project technical documentation for **harness-kit SDK**. Use links below to navigate the documents and graph.

## Documentation Index

| Document | Description | Reading |
|---|---|---|
| [**.digest.md**](./.digest.md) | Machine-readable project orientation. | **Mandatory** |
| [**.graph.json**](./.graph.json) | Complete document list, tags, and relations. | **Mandatory** |
| [**ARCHITECTURE.md**](./adr/ARCHITECTURE.md) | Project architecture baseline. | **Mandatory** |
| [**TESTS.md**](./adr/TESTS.md) | Testing tools and strategy baseline. | **Mandatory** |
| [**AGENT-RUNNERS.md**](./adr/AGENT-RUNNERS.md) | Runner registration and adapter decisions. | Optional |
| [**STATE-PERSISTENCE.md**](./adr/STATE-PERSISTENCE.md) | Product state persistence decisions. | Optional |
| [**STEERING.md**](./adr/STEERING.md) | Runtime steering and rollback decisions. | Optional |
| [**TELEMETRY.md**](./adr/TELEMETRY.md) | Token ledger and cost reporting decisions. | Optional |
| [**E2E_TESTING_SUITE.md**](./feature/qa/E2E_TESTING_SUITE.md) | Isolated end-to-end test suite guide. | Optional |
| [**HTTP_SERVER.md**](./feature/server/HTTP_SERVER.md) | HTTP daemon adapter guide. | Optional |
| [**SDK_AGENT_RUNNER.md**](./feature/agents/SDK_AGENT_RUNNER.md) | Agent runner adapters and session handling. | Optional |
| [**SDK_CLI.md**](./feature/sdk_cli.md) | CLI commands and run options. | Optional |
| [**SDK_CORE.md**](./feature/orchestration/SDK_CORE.md) | Orchestrator lifecycle and phase invariants. | Optional |
| [**SDK_DIAGNOSE.md**](./feature/agents/SDK_DIAGNOSE.md) | Diagnosis sessions and candidate workflows. | Optional |
| [**SDK_PACKAGE.md**](./feature/package/SDK_PACKAGE.md) | Published package exports and files. | Optional |
| [**SDK_PROJECT_HISTORY_ERASURE.md**](./feature/agents/SDK_PROJECT_HISTORY_ERASURE.md) | Safe discovery and removal of agent runtime history. | Optional |
| [**SDK_SETTINGS.md**](./feature/orchestration/SDK_SETTINGS.md) | Runner and phase settings. | Optional |
| [**SDK_STATE.md**](./feature/orchestration/SDK_STATE.md) | Backlog, task, and decision state mutations. | Optional |
| [**SDK_STEERING.md**](./feature/sdk_steering.md) | Steering actions and phase rollback behavior. | Optional |
| [**SDK_TERMINAL_UI.md**](./feature/terminal/SDK_TERMINAL_UI.md) | Terminal formatting and progress display. | Optional |
| [**QA_TESTER.md**](./feature/QA_TESTER.md) | Runtime QA planning, drivers, and evidence. | Optional |

## Recommended Reading Order

If an exact path is supplied, read it directly. Otherwise use this order:

1. **.digest.md** for fast project orientation.
2. **.graph.json** for document routing and one-hop relations.
3. **ARCHITECTURE.md** and **TESTS.md** for baseline decisions.
4. Selected ADR or feature documents for task-specific context.
