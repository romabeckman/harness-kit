# sdk_agent_runner — ClaudeAgentRunner

The `sdk_agent_runner` module provides the production implementation of the `IAgentRunner` outbound port defined in `sdk_core`. It wraps `@anthropic-ai/sdk` to invoke Claude models and converts all SDK errors into typed `AgentRunnerError` instances.

---

## Public API (`sdk/src/index.ts`)

| Export | Kind | Description |
|---|---|---|
| `ClaudeAgentRunner` | class | Production `IAgentRunner`. Requires `ANTHROPIC_API_KEY` env var at construction time. |
| `AgentRunnerError` | class | Typed error wrapper for all Anthropic SDK failures. Carries `code`, `skill`, `phase`, `cause`. |
| `AgentRunnerErrorCode` | enum | `MISSING_API_KEY \| TIMEOUT \| API_ERROR \| NETWORK_ERROR` |
| `AgentRunnerConfig` | type | `{ model: string; timeoutMs: number }` |

`DEFAULT_AGENT_RUNNER_CONFIG` is module-internal. Default values: `model = 'claude-sonnet-4-6'`, `timeoutMs = 300_000` (5 min).

---

## Folder Structure

```
sdk/
  src/
    index.ts                                    # Exports ClaudeAgentRunner, AgentRunnerError, AgentRunnerErrorCode, AgentRunnerConfig
    agent-runner/
      IAgentRunner.ts                           # Outbound port interface (sdk_core)
      NullAgentRunner.ts                        # No-op stub (sdk_core)
      types.ts                                  # AgentInvocation, AgentOutput, ContextPayload (sdk_core)
      AgentRunnerConfig.ts                      # Config interface + DEFAULT_AGENT_RUNNER_CONFIG
      AgentRunnerError.ts                       # AgentRunnerErrorCode enum + AgentRunnerError class
      ClaudeAgentRunner.ts                      # IAgentRunner production implementation
      __tests__/
        AgentRunnerConfig.test.ts
        AgentRunnerError.test.ts
        ClaudeAgentRunner.test.ts
  package.json                                  # Added @anthropic-ai/sdk dependency
```

---

## Architectural Decisions

### Constructor Injection of Anthropic Client

`ClaudeAgentRunner` accepts a pre-built `Anthropic` client via constructor injection (the client is stored as a private field). This keeps the production path simple while making the class fully testable without hitting the network.

### Timeout via AbortController + setTimeout

Timeout is enforced by an `AbortController` + `setTimeout` pair racing the `messages.create` call. The abort signal is passed as the second argument to `messages.create` (request options, not message params). A parallel `abortPromise` rejection race ensures Vitest fake timers can observe the timeout boundary without the mock needing to handle the signal.

### Local JSON Extraction — Not Reusing JsonExtractionProtocol

`ClaudeAgentRunner` contains its own `extractJson` function (markdown fence first, then bare brace/bracket scan, then `null`). It does not import `JsonExtractionProtocol` from `sdk_core`. The two serve different callers: `JsonExtractionProtocol` is used by the orchestrator for agent metric output; `extractJson` is used internally to populate `AgentOutput.artefacts`. Keeping them separate avoids coupling the runner to the extraction utility.

### Error Discrimination via `err.name` (Not `instanceof`)

Anthropic SDK error classes (`APIStatusError`, `APIConnectionError`, etc.) are detected by checking `err.name` as a string rather than `instanceof`. This is required for Vitest compatibility: mock objects constructed in test files cannot replicate the real SDK prototype chain across module boundaries, so `instanceof` checks would always return `false` against mocks.

### AgentRunnerError Fields

Every error thrown by `ClaudeAgentRunner` is an `AgentRunnerError` with:
- `code` — one of `AgentRunnerErrorCode` values
- `skill` — from the originating `AgentInvocation`
- `phase` — `'construction'` (API key missing) or `'dispatch'` (runtime failure)
- `cause` — the original SDK error, if any

---

## Cross-References

- Outbound port and shared types: `./docs/feature/sdk_core.md`
- Architecture conventions (external deps, error patterns): `./docs/adr/ARCHITECTURE.md`
