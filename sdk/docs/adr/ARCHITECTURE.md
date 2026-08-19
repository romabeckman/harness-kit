---
doc_type: adr
domain: architecture
stack: [TypeScript, Node.js]
node_id: "adr:architecture"
tags: [architecture, ports-and-adapters, state-machine, orchestrator]
edges:
  - relation: references
    target: "adr:tests"
updated: "2026-08-18"
---
# Project Architecture

## OVERVIEW
Use **Ports and Adapters** around a Chain-of-Responsibility orchestrator. TypeScript entrypoints drive phase handlers, filesystem state, agent runners, telemetry, CLI output, and an HTTP adapter.

## FOLDER STRUCTURE
<folder_structure>

```text
sdk/
├── src/
│   ├── cli/                 # CLI entrypoint and command services
│   ├── orchestrator/        # State machine, phase chain, and application services
│   ├── agent-runner/        # Agent port, registry, factory, CLI, and SDK adapters
│   ├── file-state/          # Filesystem port, atomic adapter, and parsers
│   ├── context-assembler/   # Typed phase payload construction
│   ├── validation-gate/     # Review score evaluation
│   ├── telemetry/           # NDJSON token ledger
│   ├── diagnose/            # Performance tracing, session ledger, and meta-harness adapter
│   ├── server/              # HTTP ports, use cases, and adapters
│   ├── settings/            # Runner and phase configuration
│   └── ui/                  # Terminal rendering helpers
├── tests/                   # Unit, integration, and isolated E2E suites
├── docker/                  # Container workspace bootstrap
└── docs/                    # ADR and feature documentation
```

</folder_structure>

## LAYERS

- **Domain and orchestration**: Own phases, transitions, validation decisions, and state invariants.
- **Application**: Coordinate phase services and HTTP use cases through explicit interfaces.
- **Inbound adapters**: Accept CLI commands or HTTP requests and map input into application calls.
- **Outbound adapters**: Run agents, mutate files, manage queues, locks, auth, jobs, and telemetry.
- **Registration**: Use factories, registries, exports, and `ChainBuilder` as composition boundaries.

## MODULES

| Module | Responsibility | Location |
|---|---|---|
| SDK core | Run `BOOTSTRAP`, optional `REFINEMENT`, `PLANNING`, `DEVELOPMENT`, `REVIEW`, `TRANSITION`, `MEMORY`, and `DEPLOY`; handle `CASCADE_BLOCKED` and `HALTED`. | [SDK_CORE.md](../feature/SDK_CORE.md) |
| Agent runners | Register CLI and SDK strategies behind `IAgentRunner`. | [SDK_AGENT_RUNNER.md](../feature/SDK_AGENT_RUNNER.md) |
| File state | Parse and atomically mutate Markdown and JSON project state. | [SDK_STATE.md](../feature/SDK_STATE.md) |
| Steering | Validate free-text directives and apply rule, rollback, or score actions. | [SDK_STEERING.md](../feature/SDK_STEERING.md) |
| Settings | Resolve runner defaults and per-phase overrides. | [SDK_SETTINGS.md](../feature/SDK_SETTINGS.md) |
| Diagnose | Process pending sessions, trace execution, and trigger meta-harness optimization. | [SDK_DIAGNOSE.md](../feature/SDK_DIAGNOSE.md) |
| CLI | Parse `hrns` commands and coordinate interactive execution. | [SDK_CLI.md](../feature/SDK_CLI.md) |
| HTTP server | Expose non-interactive orchestration, settings, telemetry, reports, and health endpoints. | [HTTP_SERVER.md](../feature/HTTP_SERVER.md) |
| Terminal UI | Render banners, progress, and ANSI output. | [SDK_TERMINAL_UI.md](../feature/SDK_TERMINAL_UI.md) |
| Package | Define public exports and npm build output. | [SDK_PACKAGE.md](../feature/SDK_PACKAGE.md) |

## PATTERNS

REQUIRED: Inject ports through constructors or orchestrator options.
REQUIRED: Register runner strategies with `AgentRunnerRegistry`; instantiate them with `AgentRunnerFactory`.
REQUIRED: Propagate `AbortSignal` into child processes and SDK requests.
REQUIRED: Mutate persistent state through `IFileStateManager` using atomic temporary-file replacement.
REQUIRED: Validate changes in order: `rtk npm install`, lint, build, typecheck, then tests.
REQUIRED: Track and isolate agent sessions across phases using `DeveloperSessionState` with mandatory `phase` tag; resume Development and Review sessions on retries and clear all sessions on feature transition.
PROHIBITED: Import concrete agent runners into orchestration decisions.
PROHIBITED: Put HTTP transport logic inside use cases.
PROHIBITED: Bypass state adapters with direct writes from phase handlers.

<code_patterns>

```typescript
// # CORRECT: register an adapter at the composition boundary
AgentRunnerRegistry.register({ type: 'custom-runner', constructor: CustomRunner })

// # WRONG: bind orchestration logic to a concrete adapter
const runner = new ClaudeCLIRunner()
```

</code_patterns>

## INTEGRATIONS

| External Service / Component | Purpose | Connection / Authentication Method |
|---|---|---|
| Agent CLIs | Execute local agent processes | Spawned commands with filtered environment and abort handling |
| Anthropic, Copilot, Cursor SDKs | Execute API-backed agents | Provider SDK credentials from environment |
| Git | Prepare and synchronize isolated workspaces | Local CLI, configured remote credentials, and worktrees |
| Filesystem | Persist product state and telemetry | Node.js filesystem APIs with atomic rename |
| HTTP clients | Submit and monitor daemon jobs | Configurable no-auth, Basic, Bearer, JWT, or HMAC strategy |

## REFERENCES

- [**README.md**](../README.md): Main documentation index.
- [**TESTS.md**](./TESTS.md): Validation order, test tooling, and suite boundaries.
