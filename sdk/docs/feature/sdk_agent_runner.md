# sdk_agent_runner — Modular Agent Runner

## OVERVIEW
The `sdk_agent_runner` module provides a decoupled, pluggable architecture for executing coding agents. It supports multiple strategies including Claude Code, Anthropic API, and Google's Antigravity (agy), and allows external plugins to register custom runners dynamically.

## DIRECTORY STRUCTURE
<folder_structure>
sdk/src/agent-runner/
├── IAgentRunner.ts           # Outbound port interface
├── NullAgentRunner.ts        # No-op stub implementation
├── AbstractCliRunner.ts      # Base class for all CLI subprocess runners
├── types.ts                  # Shared types and config schemas
├── AgentRunnerRegistry.ts    # Static registry of strategy classes
├── AgentRunnerFactory.ts     # Instantiation factory executing validations
├── claude-cli/              # Subdirectory for local Claude Code CLI execution
├── claude-sdk/             # Subdirectory for Anthropic SDK API calls
├── antigravity-cli/         # Subdirectory for Google's agy CLI execution
├── copilot-cli/             # Subdirectory for GitHub Copilot CLI execution
├── copilot-sdk/             # Subdirectory for GitHub Copilot SDK execution
├── cursor-cli/              # Subdirectory for Cursor agent CLI execution
├── cursor-sdk/             # Subdirectory for Cursor SDK execution
└── README.md                 # Blueprint for custom runner plugins
</folder_structure>

## DESIGN SYSTEM & PATTERNS
- **Strategy Pattern**: Concrete execution engines implement the `IAgentRunner` interface.
- **Factory & Registry Pattern**: Decouples orchestrator from concrete implementations. The orchestrator requests a runner via `AgentRunnerFactory.create({ type: 'antigravity-cli' })`.
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
| `claude-cli` | *(none)* | `claude` | — | CLI subprocess spawn; default when no flag is passed. |
| `claude-sdk` | *(auto, env)* | — | Anthropic API | Used when `ANTHROPIC_API_KEY` is set and no explicit runner is given. |
| `antigravity-cli` | `--agent antigravity-cli` | `agy` | `gemini-2.5-flash` | Google Antigravity CLI subprocess. Default model is `gemini-2.5-flash`. |
| `copilot-sdk` | `--agent copilot-sdk` | — | — | GitHub Copilot via SDK (non-subprocess). |
| `copilot-cli` | `--agent copilot-cli` | `copilot` | *(config)* | GitHub Copilot CLI subprocess. Uses `--allow-all-tools` for non-interactive mode. |
| `cursor-cli` | `--agent cursor-cli` | `cursor` | *(config)* | Cursor agent CLI subprocess. Invokes `cursor agent --print --output-format stream-json --force`. |
| `cursor-sdk` | `--agent cursor-sdk` | — | `composer-2.5` | Cursor agent via `@cursor/sdk`. Requires `CURSOR_API_KEY`. |

## CLI OPTIONS
REQUIRED: Pass agent selection flags when running orchestration command:

| Flag | Description |
|---|---|
| `hrns run --copilot-sdk` | Resolves `copilot-sdk` runner. |
| `hrns run --gemini` | Resolves `gemini` runner. |
| `hrns run --agent <type>` / `hrns -a <type>` | Resolves custom strategy named `<type>`. |
| `hrns run --model <name>` / `hrns -m <name>` | Overrides the default model for the selected runner. |

## REFERENCES
- [**README.md**](../README.md): Main documentation index.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Arch patterns and integrations.
- [**TESTS.md**](../adr/TESTS.md): Testing guidelines.

## ERROR HANDLING

All runners throw `AgentRunnerError` on failure. The `code` field distinguishes the failure category:

| Code | Meaning | Typical Cause |
|---|---|---|
| `MISSING_API_KEY` | Required env var absent | `ANTHROPIC_API_KEY` not set |
| `TIMEOUT` | Orchestrator-level timeout fired | `timeoutMs` exceeded |
| `NETWORK_ERROR` | Connection-level failure | `ENOENT`, `ECONNREFUSED`, `APIConnectionError` |
| `API_ERROR` | Semantic 4xx from the provider | HTTP 401, 403, 400 — not 429 |
| `QUOTA_EXCEEDED` | Rate limit or quota exhausted | HTTP 429, `rate_limit_error`, `overloaded_error` |
| `UNKNOWN_ERROR` | Unrecognised failure | JS exceptions, unhandled exit codes |

### Quota Detection

`ClaudeAgentRunner` detects quota errors **before** the generic `isApiStatusError` guard:
- HTTP status `429`
- Message containing `rate_limit`, `overloaded_error`, or `quota`

`ClaudeCLIRunner` and `AbstractCliRunner` apply a regex `/rate.?limit|quota|overloaded/i` against the CLI output / stderr.

### Orchestrator Behaviour on `QUOTA_EXCEEDED`

When a `QUOTA_EXCEEDED` error propagates to `HarnessOrchestrator.run()`:
1. The current phase is **persisted** to `BOOTSTRAP-CONFIG.json` (via `persistPhase()` which already runs before dispatch, so state is safe).
2. A warning with resume instructions is written to **stderr**.
3. The orchestrator transitions to `Phase.HALTED` — no crash, no stack trace.
4. The user resumes with `hrns run` → select **"resume"**.
