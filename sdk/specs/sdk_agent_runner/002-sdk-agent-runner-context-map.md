# Context Map — SDK Agent Runner (F003)

Domain: `sdk_agent_runner`
Project: `sdk`
Sources: `001-sdk-agent-runner-problem-space.md`

---

## 1. Bounded Contexts

### BC-1: `sdk_agent_runner`

The context being designed in this feature. It owns:

- `ClaudeAgentRunner` — production implementation of the `IAgentRunner` outbound port.
- `AgentRunnerError` — typed error hierarchy with code, phase, and cause.
- `AgentRunnerConfig` — immutable value object for model and timeout configuration.
- JSON extraction logic: markdown fences strategy followed by bare JSON fallback.
- Timeout enforcement via `AbortController`.

This context has no persistent state. Every invocation is stateless from the BC's perspective.

### BC-2: `sdk_core`

The upstream context that defines the port `ClaudeAgentRunner` must satisfy. It owns:

- `IAgentRunner` — the outbound port interface (`run(invocation: AgentInvocation): Promise<AgentOutput>`).
- `AgentInvocation` — input type (`skill`, `agent`, `mode`, `payload`).
- `AgentOutput` — output type (`raw`, `artefacts?`).
- `ContextPayload` — the structured key-value payload assembled by `ContextAssembler`.
- `NullAgentRunner` — the existing no-op stub that `ClaudeAgentRunner` replaces in production.

`sdk_core` is the **upstream supplier**. It defines contracts; `sdk_agent_runner` is obligated to satisfy them.

### BC-3: Anthropic SDK (external)

The external library `@anthropic-ai/sdk`. It owns:

- `Anthropic` client class — instantiated with `apiKey`.
- `messages.create(params)` — the single API call used by `ClaudeAgentRunner`.
- `AnthropicError` and subclasses — the error hierarchy thrown on API or network failures.
- The model identifier string (e.g., `claude-sonnet-4-6`) — passed through from `AgentRunnerConfig`.

This context is external and cannot be modified. `sdk_agent_runner` conforms to its calling conventions.

---

## 2. Context Map

```
sdk_core (upstream / Customer-Supplier)
    |
    |  IAgentRunner (outbound port interface)
    |  AgentInvocation, AgentOutput, ContextPayload (shared types)
    |
    v
sdk_agent_runner (ClaudeAgentRunner implements IAgentRunner)
    |
    |  Anti-Corruption Layer
    |  (AgentInvocation → messages.create params)
    |  (Anthropic response → AgentOutput)
    |  (AnthropicError → AgentRunnerError)
    |
    v
Anthropic SDK / @anthropic-ai/sdk (Conformist — external, read-only)
```

### Relationship Table

| From | To | Pattern | Direction | What is shared / consumed |
|---|---|---|---|---|
| `sdk_agent_runner` | `sdk_core` | Customer / Supplier | `sdk_core` defines contracts; `sdk_agent_runner` must conform | `IAgentRunner`, `AgentInvocation`, `AgentOutput`, `ContextPayload` — imported, never modified |
| `sdk_agent_runner` | `Anthropic SDK` | Anti-Corruption Layer | `sdk_agent_runner` consumes the external API; translates its errors and response shapes into domain types | `Anthropic` client, `messages.create`, `AnthropicError` — translated at the boundary, never leaked to callers |

---

## 3. Integration Notes

### Contract: `IAgentRunner` port (from `sdk_core`)

`ClaudeAgentRunner` must satisfy this exact signature:

```
IAgentRunner.run(invocation: AgentInvocation): Promise<AgentOutput>
```

- Input: `AgentInvocation { skill: string, agent: string, mode: 'autonomous', payload: ContextPayload }`
- Output: `AgentOutput { raw: string, artefacts?: Record<string, string> }`

`ClaudeAgentRunner` maps `invocation` into the Anthropic `messages.create` user message body (JSON-serialized), and maps the API response text back into `AgentOutput.raw`. The `artefacts` field is populated from `ExtractedJson` when the extracted value is a `Record<string, string>`; otherwise `artefacts` is omitted.

### Contract: `@anthropic-ai/sdk` surface consumed

Only one method is called:

```
anthropic.messages.create({
  model: string,             // from AgentRunnerConfig.model
  max_tokens: number,        // fixed constant (e.g., 8192)
  messages: [{ role: 'user', content: string }],
  signal: AbortSignal,       // from AbortController
})
```

No streaming. No tool use. No system prompt unless explicitly added in a future task.

### Anti-Corruption Layer responsibilities

The ACL in `ClaudeAgentRunner` performs three translations:

1. **Input translation** — `AgentInvocation` → `messages.create` params. `payload` is serialized to JSON and embedded in the user message string alongside `skill` and `agent`.

2. **Output translation** — Anthropic `Message.content` blocks → `AgentOutput.raw`. All `ContentBlock` items of type `text` are concatenated in order.

3. **Error translation** — Anthropic SDK errors → `AgentRunnerError`:
   - HTTP 4xx or 5xx status (`APIStatusError`) → `AgentRunnerError(API_ERROR)`
   - No-response network errors (`APIConnectionError`) → `AgentRunnerError(NETWORK_ERROR)`
   - `AbortController` abort → `AgentRunnerError(TIMEOUT)`

   The original error is always preserved in `AgentRunnerError.cause` for diagnostics.

### Isolation guarantee

No `AnthropicError` type, Anthropic SDK interface, or raw HTTP response ever propagates beyond `ClaudeAgentRunner`. All callers (including `HarnessOrchestrator`) see only `AgentRunnerError` or `AgentOutput`. This isolation means the Anthropic SDK can be swapped for a different provider without changing `sdk_core` or the orchestrator.
