---
doc_type: adr
domain: agent_runner
stack: [TypeScript, Node.js]
node_id: "adr:agent_runners"
tags: [agent-runner, strategies, factory, registry]
edges:
  - relation: references
    target: "adr:architecture"
updated: "2026-08-15"
---
# Agent Runners
Decouples agent execution clients and strategies from the orchestrator engine.

## OVERVIEW
Agent runners abstract target LLM client integrations (CLI, API) for executing development, review, and QA tasks. They use a registry and factory to support dynamic instantiation.

## FOLDER STRUCTURE
<folder_structure>
sdk/src/
└── agent-runner/                 # Agent runner port and adapters
    ├── IAgentRunner.ts           # Core interface for running invocations
    ├── AbstractCliRunner.ts      # Shared spawn/abort/kill base for CLI runners
    ├── AgentRunnerRegistry.ts    # Static singleton runner strategy registry
    ├── AgentRunnerFactory.ts     # Dynamic factory creating strategy instances
    ├── claude-cli/              # Claude CLI execution adapter
    ├── claude-sdk/             # Anthropic API execution adapter
    ├── antigravity-cli/         # Google Antigravity execution adapter
    ├── codex-cli/               # Codex CLI execution adapter
    ├── copilot-cli/             # GitHub Copilot CLI execution adapter
    ├── copilot-sdk/             # GitHub Copilot SDK execution adapter
    ├── cursor-cli/              # Cursor agent CLI execution adapter
    ├── cursor-sdk/             # Cursor SDK execution adapter
    └── kiro-cli/               # AWS Kiro CLI execution adapter
</folder_structure>

## HOW TO REGISTER AND RUN AN AGENT
### Prerequisites
1. Concrete runner implementation of `IAgentRunner`.
2. Static registration inside the registry.

### Steps
1. Invoke `AgentRunnerRegistry.register` passing the runner type and constructor class.
2. Instantiate the target runner class dynamically using `AgentRunnerFactory.create({ type })`.
3. Invoke `run` on the instantiated runner with an `AgentInvocation` payload and options.

<code_example>
# CORRECT: Statically register runner strategy constructors
AgentRunnerRegistry.register({
  type: 'custom-runner',
  constructor: CustomRunner
})

# WRONG: Hardcode and instantiate concrete runner strategies in core logic
const runner = new ClaudeCLIRunner() // Violates ports and adapters decoupling
</code_example>

## RUNNER FORMAT SPECIFICATIONS
### ClaudeCLIRunner (`claude-cli`)
- Executes binary `claude` with `--output-format stream-json`.
- Resumes conversations via `--resume <session.id>`.
- Extracts session ID from `session_id`/`sessionId` stream events.
### AntigravityCLIRunner (`antigravity-cli`)
- Executes binary `agy` with `--output-format json` by default.
- Resumes conversations via `--conversation <session.id>`.
- Parses stdout JSON structure containing `status`, `response`, `structured_output`, `usage`, and `conversation_id`.
- Extracts token counts: `inputTokens`, `outputTokens`, `cacheReadTokens`.
### CodexCLIRunner (`codex-cli`)
- Executes binary `codex` with subcommand `exec --json --dangerously-bypass-approvals-and-sandbox`.
- Resumes conversations via `exec resume <session.id>`.
- Extracts token counts, cost, and session ID (`thread_id`/`session_id`).
### CopilotCLIRunner (`copilot-cli`)
- Executes binary `copilot` with `--output-format json --allow-all-tools`.
- Resumes conversations via `--resume <session.id>`.
- Extracts session ID from `sessionId`/`session_id` in result events.
### CursorCLIRunner (`cursor-cli`)
- Executes binary `agent` with `--print --force --output-format stream-json`.
- Resumes conversations via `--resume <session.id>`.
- Extracts session ID from `session_id` stream events.
### KiroCLIRunner (`kiro-cli`)
- Executes binary `kiro-cli` with subcommand `chat --no-interactive --trust-all-tools`.
- Does not support session resumption.
- Parses `result` events from stdout JSON stream; extracts token counts with both snake_case and camelCase fallbacks.

## PARAMETERS / CONFIGURATIONS
| Name | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| type | string | Yes | The strategy name identifier of the runner | — |
| timeoutMs | number | No | Timeout override for the invocation | — |
| model | string | No | Model override for the invocation | — |
| effort | string | No | Effort parameter override for reasoning models | — |
| session | AgentSession | No | Session identifier for resuming active conversations | — |

## BEST PRACTICES
REQUIRED: Propagate AbortSignal downward to child process groups or API requests to prevent resource leaks.
REQUIRED: Import all built-in strategies inside `AgentRunnerFactory` to force self-registration.
FORBIDDEN: Making direct external API calls without wrapping them in concrete adapter strategies.
REQUIRED: Return extracted `session` in `AgentOutput` whenever the underlying agent runner provides conversation state.

## REFERENCES
- [**ARCHITECTURE.md**](./ARCHITECTURE.md): Architecture overview and public public-facing package entry points.
- [**TESTS.md**](./TESTS.md): Vitest runner mock execution protocols.
