---
doc_type: feature
domain: agent_runner
stack: [TypeScript, Node.js]
node_id: "feature:sdk_agent_runner"
tags: [agent-runner, strategies, factory, runner]
edges:
  - relation: implements
    target: "adr:architecture"
  - relation: tested_by
    target: "adr:tests"
updated: "2026-08-08"
---
# SDK AGENT RUNNER
Provides a decoupled, pluggable architecture for executing coding agents.

## OVERVIEW
The `sdk_agent_runner` module provides a pluggable architecture for executing coding agents. It supports multiple strategies including Claude Code, Anthropic API, and Google's Antigravity (agy).

## FOLDER STRUCTURE
<folder_structure>
```
sdk/src/agent-runner/
├── IAgentRunner.ts           # Outbound port interface
├── NullAgentRunner.ts        # No-op stub implementation
├── AbstractCliRunner.ts      # Base class for all CLI subprocess runners
├── types.ts                  # Shared types and config schemas
├── AgentRunnerRegistry.ts    # Static registry of strategy classes
├── AgentRunnerFactory.ts     # Instantiation factory executing validations
├── claude-cli/               # Subdirectory for local Claude Code CLI execution
├── claude-sdk/               # Subdirectory for Anthropic SDK API calls
├── antigravity-cli/          # Subdirectory for Google's agy CLI execution
├── copilot-cli/              # Subdirectory for GitHub Copilot CLI execution
├── copilot-sdk/              # Subdirectory for GitHub Copilot SDK execution
├── cursor-cli/               # Subdirectory for Cursor agent CLI execution
├── cursor-sdk/               # Subdirectory for Cursor SDK execution
└── README.md                 # Blueprint for custom runner plugins
```
</folder_structure>

## DESIGN SYSTEM & PATTERNS

### Patterns
- **Strategy Pattern**: Concrete execution engines implement the `IAgentRunner` interface.
- **Factory & Registry Pattern**: Decouples orchestrator from concrete implementations.

## HOW TO RUN AGENTS

### Prerequisites
1. Provide necessary API keys (e.g. `ANTHROPIC_API_KEY`, `CURSOR_API_KEY`).
2. Have the CLI tool installed for the chosen agent (e.g. `claude`, `agy`).

### Steps
1. Select the agent type using the CLI flag.
2. Execute the `hrns run` command with the selected agent.

<code_example>
# CORRECT: Providing agent flag
hrns run --agent antigravity-cli

# WRONG: Running without configuring the default agent correctly
hrns run --agent unknown-agent
</code_example>

## PARAMETERS / CONFIGURATIONS

| Name | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| `--agent` | string | No | Resolves custom strategy named `<type>` | `claude-cli` |
| `--model` | string | No | Overrides the default model for the selected runner | Varies |

## BEST PRACTICES
REQUIRED: Pass agent selection flags when running orchestration command.
PROHIBITED: Hardcoding agent implementations directly into the orchestrator.

## REFERENCES
- [**README.md**](../README.md): Main documentation index.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Arch patterns and integrations.
- [**TESTS.md**](../adr/TESTS.md): Testing guidelines.

---

## CHANGE SUMMARY
- **Added:** YAML frontmatter, standard folder structure block, CHANGE SUMMARY.
- **Updated:** `AntigravityCLIRunner` defaults to `--output-format json` with structured JSON output parsing for tokens (`inputTokens`, `outputTokens`, `cacheReadTokens`), artefacts, and error handling.
- **Updated:** Section titles converted to uppercase, imperative tone applied.
- **Removed:** Extra boilerplate text.
