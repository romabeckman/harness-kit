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
├── claude-code/              # Subdirectory for local Claude Code CLI execution
├── claude-agent/             # Subdirectory for Anthropic SDK API calls
├── antigravity/              # Subdirectory for Google's agy CLI execution
└── README.md                 # Blueprint for custom runner plugins
</folder_structure>

## DESIGN SYSTEM & PATTERNS
- **Strategy Pattern**: Concrete execution engines implement the `IAgentRunner` interface.
- **Factory & Registry Pattern**: Decouples orchestrator from concrete implementations. The orchestrator requests a runner via `AgentRunnerFactory.create({ type: 'antigravity' })`.
- **AbortSignal Propagation**: Run methods accept an `AbortSignal` in options. Concrete runners monitor this signal and terminate subprocess trees or API connection handles if triggered.

```typescript
export interface AgentInvocation {
  agent: string         // Agent role name (e.g., 'developer-backend')
  mode: 'autonomous' | 'interactive'
  payload: ContextPayload
  skill?: string        // OPTIONAL — if omitted, no skill folder lookup is performed
  prompt?: string       // Explicit prompt override; takes precedence over payload serialization
}
```

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

| Runner | CLI Flag | Binary | Default Model | Description |
|---|---|---|---|---|
| `claude-code` | *(none)* | `claude` | — | CLI subprocess spawn; default when no flag is passed. |
| `claude-agent` | *(auto, env)* | — | Anthropic API | Used when `ANTHROPIC_API_KEY` is set and no explicit runner is given. |
| `antigravity` | `--agent antigravity` | `agy` | `gemini-2.5-flash` | Google Antigravity CLI subprocess. Default model is `gemini-2.5-flash`. |
| `copilot` | `--copilot` | `copilot` | — | GitHub Copilot CLI subprocess. |

## CLI OPTIONS
REQUIRED: Pass agent selection flags when running orchestration command:

| Flag | Description |
|---|---|
| `hrns run --copilot` | Resolves `copilot` runner. |
| `hrns run --gemini` | Resolves `gemini` runner. |
| `hrns run --agent <type>` / `hrns -a <type>` | Resolves custom strategy named `<type>`. |
| `hrns run --model <name>` / `hrns -m <name>` | Overrides the default model for the selected runner. |

## REFERENCES
- [**README.md**](../README.md): Main documentation index.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Arch patterns and integrations.
- [**TESTS.md**](../adr/TESTS.md): Testing guidelines.

