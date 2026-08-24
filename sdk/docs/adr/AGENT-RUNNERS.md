---
doc_type: adr
domain: agent_runner
stack: [TypeScript, Node.js, cross-spawn]
node_id: "adr:agent_runners"
tags: [agent-runner, strategies, factory, registry, opencode]
edges:
  - relation: references
    target: "adr:architecture"
updated: "2026-08-24"
---
# Agent Runners
Decouples agent execution clients and strategies from the orchestrator engine.

## OVERVIEW
Agent runners abstract target LLM client integrations (CLI, API) for development, review, and QA tasks. A registry and factory provide dynamic instantiation while concrete adapters own vendor-specific process and protocol translation.

## FOLDER STRUCTURE
<folder_structure>
```
src/agent-runner/
├── ports and shared types/      # IAgentRunner, invocation, output, and errors
├── registry and factory/        # Composition and self-registration
├── shared CLI base/             # Spawn, abort, timeout, environment, and hooks
├── CLI adapters/                # Claude, Antigravity, Codex, Copilot, Cursor, Kiro, OpenCode
└── SDK adapters/                # Anthropic, Copilot, and Cursor integrations
```
</folder_structure>

## HOW TO REGISTER AND RUN AN AGENT
### Prerequisites
1. Provide a concrete `IAgentRunner` implementation.
2. Register its constructor at the registry composition boundary.

### Steps
1. Register the runner type and constructor with `AgentRunnerRegistry`.
2. Import the built-in adapter from `AgentRunnerFactory` so module evaluation registers it.
3. Create the runner with `AgentRunnerFactory.create({ type })`.
4. Invoke `run` with an `AgentInvocation` and options.

## RUNNER FORMAT SPECIFICATIONS
### ClaudeCLIRunner (`claude-cli`)
- Executes `claude` with stream JSON output and resumes with `--resume <session.id>`.
- Extracts session IDs from `session_id` or `sessionId` events.
### AntigravityCLIRunner (`antigravity-cli`)
- Executes `agy` with JSON output, resumes with `--conversation <session.id>`, and extracts response, structured output, usage, and `conversation_id`.
### CodexCLIRunner (`codex-cli`)
- Executes `codex exec --json --dangerously-bypass-approvals-and-sandbox`, resumes with `exec resume <session.id>`, and extracts usage and thread IDs.
### CopilotCLIRunner (`copilot-cli`)
- Executes JSON output with all tools enabled, resumes with `--resume <session.id>`, and extracts `sessionId` or `session_id`.
### CursorCLIRunner (`cursor-cli`)
- Executes `agent --print --force --output-format stream-json`, resumes with `--resume <session.id>`, and extracts `session_id`.
### KiroCLIRunner (`kiro-cli`)
- Executes `kiro-cli chat --no-interactive --trust-all-tools`; parses result events and does not resume sessions.
### OpenCodeCLIRunner (`opencode-cli`)
- Executes the `opencode run` subcommand with prompts on stdin.
- Maps model, effort (via `--variant`), agent, session, and workspace values to supported CLI flags; ignores additional-directory values because OpenCode 1.18.21 has no equivalent flag.
- Parses ANSI-clean JSON objects or JSON-lines events for response text, structured artefacts, usage, cost, and session IDs.
- Emits text/tool progress from assistant and item events; classifies non-zero exits and parsed agent failures as `API_ERROR`.

## PARAMETERS / CONFIGURATIONS
| Name | Type | Required | Description | Default |
|---|---|---|---|---|
| `type` | string | Yes | Strategy identifier. | — |
| `timeoutMs` | number | No | Invocation or constructor timeout override. | phase default |
| `model` | string | No | Provider/model override. | — |
| `effort` | string | No | Reasoning effort forwarded by supporting adapters. | — |
| `session` | AgentSession | No | Native conversation identifier for resume. | — |

## BEST PRACTICES
REQUIRED: Propagate `AbortSignal` to child processes or SDK requests.
REQUIRED: Import built-in strategies inside `AgentRunnerFactory` to force self-registration.
REQUIRED: Filter merged process and invocation environments before spawning a CLI.
REQUIRED: Return extracted session state in `AgentOutput` when an adapter provides it.
PROHIBITED: Make direct external API calls without a concrete adapter.
PROHIBITED: Assume optional vendor flags exist without checking the installed CLI contract.

## REFERENCES
- [**ARCHITECTURE.md**](./ARCHITECTURE.md): System layers, ports, adapters, and composition boundaries.
- [**SDK_AGENT_RUNNER.md**](../feature/SDK_AGENT_RUNNER.md): Operational runner behavior, including OpenCode mapping and output normalization.
- [**TESTS.md**](./TESTS.md): Vitest commands and external-process test boundaries.
