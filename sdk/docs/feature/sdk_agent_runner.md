# sdk_agent_runner — Modular Agent Runner

## OVERVIEW
The `sdk_agent_runner` module provides a decoupled, pluggable architecture for executing coding agents. It supports multiple strategies including Claude Code, Anthropic API, and Google's Antigravity (agy), and allows external plugins to register custom runners dynamically.

## DIRECTORY STRUCTURE
<folder_structure>
sdk/src/agent-runner/
├── IAgentRunner.ts           # Outbound port interface
├── NullAgentRunner.ts        # No-op stub implementation
├── types.ts                  # Shared types and config schemas
├── AgentRunnerRegistry.ts    # Static registry of strategy classes
├── AgentRunnerFactory.ts     # Instantiation factory executing validations
├── ClaudeCodeRunner.ts       # Adapter for local Claude Code CLI execution
├── ClaudeAgentRunner.ts      # Adapter for Anthropic SDK API calls
├── AntigravityRunner.ts      # Adapter for Google's agy CLI execution
└── README.md                 # Blueprint for custom runner plugins
</folder_structure>

## DESIGN SYSTEM & PATTERNS
- **Strategy Pattern**: Concrete execution engines implement the `IAgentRunner` interface.
- **Factory & Registry Pattern**: Decouples orchestrator from concrete implementations. The orchestrator requests a runner via `AgentRunnerFactory.create({ type: 'antigravity' })`.
- **AbortSignal Propagation**: Run methods accept an `AbortSignal` in options. Concrete runners monitor this signal and terminate subprocess trees or API connection handles if triggered.

## REGISTRY CONTRACTS
| Method | Description |
|---|---|
| `AgentRunnerRegistry.register(registration)` | Registers strategy constructors and validation schemas. Throws on duplication. |
| `AgentRunnerRegistry.get(type)` | Resolves registration options. |
| `AgentRunnerRegistry.has(type)` | Checks existence in the register map. |

## FACTORY CONTRACTS
| Method | Description |
|---|---|
| `AgentRunnerFactory.create(config)` | Resolves type, executes `validateConfig` function, and returns concrete instance. |

## BUILT-IN RUNNERS
- **claude-code**: CLI-based execution spawning `claude` subprocesses. Default runner option.
- **claude-agent**: API-based execution invoking Anthropic Messages client.
- **antigravity**: CLI-based execution spawning Google `agy` subprocesses.

## CLI OPTIONS
REQUIRED: Pass agent selection flags when running orchestration command:
- `hk run --copilot` — Instructs factory to resolve `'copilot'` runner.
- `hk run --gemini` — Instructs factory to resolve `'gemini'` runner.
- `hk run --agent <type>` / `hk run -a <type>` — Instructs factory to resolve custom strategy named `<type>`.

## REFERENCES
- [**README.md**](../README.md): Main documentation index.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Arch patterns and integrations.
- [**TESTS.md**](../adr/TESTS.md): Testing guidelines.

