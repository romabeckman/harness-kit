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
    └── cursor-sdk/             # Cursor SDK execution adapter
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
### AntigravityCLIRunner (`antigravity-cli`)
- Executes binary `agy` with `--output-format json` by default.
- Parses stdout JSON structure containing `status`, `response`, `structured_output`, and `usage`.
- Extracts token counts: `inputTokens`, `outputTokens`, `cacheReadTokens`. Note that `outputTokens` already includes `thinking_tokens`.
### CodexCLIRunner (`codex-cli`)
- Executes binary `codex` with subcommand `exec --json --dangerously-bypass-approvals-and-sandbox`.
- Writes prompt to stdin and streams JSON events.
- Extracts token counts and cost: `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `costUsd`.


## PARAMETERS / CONFIGURATIONS
| Name | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| type | string | Yes | The strategy name identifier of the runner | — |
| timeoutMs | number | No | Timeout override for the invocation | — |
| model | string | No | Model override for the invocation | — |
| effort | string | No | Effort parameter override for reasoning models | — |

## BEST PRACTICES
REQUIRED: Propagate AbortSignal downward to child process groups or API requests to prevent resource leaks.
REQUIRED: Import all built-in strategies inside `AgentRunnerFactory` to force self-registration.
FORBIDDEN: Making direct external API calls without wrapping them in concrete adapter strategies.

## REFERENCES
- [**ARCHITECTURE.md**](./ARCHITECTURE.md): Architecture overview and public public-facing package entry points.
- [**TESTS.md**](./TESTS.md): Vitest runner mock execution protocols.
