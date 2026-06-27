# Problem Space — SDK Agent Runner (F003)

Domain: `sdk_agent_runner`
Project: `sdk`

---

## 1. Event Storming

The following domain events capture the full lifecycle of a single agent invocation from the perspective of `ClaudeAgentRunner`.

| # | Domain Event | Triggered When |
|---|---|---|
| E01 | AgentRunRequested | `IAgentRunner.run(invocation)` is called by the orchestrator |
| E02 | ApiKeyValidated | `ANTHROPIC_API_KEY` env var is present and non-empty at construction time |
| E03 | AnthropicClientCreated | `new Anthropic({ apiKey })` succeeds internally |
| E04 | PromptDispatched | `anthropic.messages.create(...)` is called with the assembled payload |
| E05 | AbortTimerStarted | `AbortController` + `setTimeout(timeoutMs)` are armed before the API call |
| E06 | ResponseReceived | `messages.create` resolves before the timer fires |
| E07 | RawOutputCollected | All `content` blocks from the response are concatenated into a single string |
| E08 | JsonExtractionAttempted | `rawOutput` is scanned for a JSON payload |
| E09 | JsonExtractedFromFences | A markdown code fence ` ```json ... ``` ` was found and parsed |
| E10 | JsonExtractedBare | A bare JSON object or array was found outside any fence |
| E11 | NoJsonFound | Extraction scan completed with no valid JSON — `extractedJson = null` |
| E12 | AgentOutputReturned | `AgentOutput { raw, artefacts }` is resolved to the caller |
| E13 | TimeoutOccurred | `setTimeout` fired before the API responded — `AbortController.abort()` called |
| E14 | ApiErrorThrown | `messages.create` rejected with an HTTP 4xx or 5xx status code |
| E15 | NetworkFailureDetected | `messages.create` rejected with no HTTP response (DNS failure, connection refused) |
| E16 | MissingApiKeyDetected | `ANTHROPIC_API_KEY` is absent at construction time — thrown immediately |

---

## 2. Subdomains

### Core — `sdk_agent_runner`

What is unique to this feature and cannot be bought off the shelf:

- The decision to use `AbortController` for timeout rather than a library wrapper.
- The specific JSON extraction strategy (markdown fences first, then bare substring).
- The `AgentRunnerError` typed error with `code`, `agentType`, `phase`, and `cause` — a contract shared with orchestrator callers.
- The mapping from `AgentInvocation.payload` to the `messages.create` user message body.

### Supporting — delegates to these

| Dependency | What is consumed |
|---|---|
| `sdk_core` | `IAgentRunner` interface (outbound port) — `ClaudeAgentRunner` is the production implementation of this port |
| `sdk_core` | `AgentInvocation` and `AgentOutput` types — the input/output contract |
| `sdk_core` | `ContextPayload` — the structured data the orchestrator has already assembled |

### Generic — infrastructure concerns

| Concern | How handled |
|---|---|
| HTTP transport | Managed entirely by `@anthropic-ai/sdk` |
| Environment variables | `process.env.ANTHROPIC_API_KEY` — read once at construction |
| Timers | Node.js `setTimeout` / `clearTimeout` — used for deadline enforcement |
| AbortSignal | Web-standard `AbortController` passed to `messages.create` |

---

## 3. Ubiquitous Language Glossary

| Term | Definition |
|---|---|
| **AgentRun** | A single end-to-end execution of `IAgentRunner.run(invocation)` — from the moment the orchestrator calls `run()` to the moment `AgentOutput` is resolved or an error is thrown. |
| **RawOutput** | The unprocessed text string collected by concatenating all `content` blocks from the Anthropic API response; it is stored in `AgentOutput.raw` and inspected by the JSON extraction step. |
| **ExtractedJson** | The parsed JavaScript value (object, array, or primitive) recovered from `RawOutput` by the extraction strategy; `null` when no valid JSON is present in `RawOutput`. |
| **AgentRunnerError** | The typed error class thrown by `ClaudeAgentRunner` in all failure paths; it carries a `code` discriminant (`MISSING_API_KEY`, `TIMEOUT`, `API_ERROR`, `NETWORK_ERROR`), the `skill` that was being invoked, the lifecycle `phase` where the failure occurred, and the original `cause` error when one exists. |
| **Timeout** | The maximum wall-clock duration (in milliseconds) `ClaudeAgentRunner` will wait for the Anthropic API to respond; configured via `AgentRunnerConfig.timeoutMs`; enforced by an `AbortController` armed before each `messages.create` call. |
| **ApiKey** | The string value of `process.env.ANTHROPIC_API_KEY`, read once in the `ClaudeAgentRunner` constructor; if absent the constructor throws `AgentRunnerError(MISSING_API_KEY)` before any network activity occurs. |
| **ClaudeAgentRunner** | The production implementation of `IAgentRunner` — the concrete class in this feature that wraps the Anthropic SDK client and enforces timeout, error classification, and JSON extraction. |
| **AgentRunnerConfig** | An immutable value object holding `model` (default `claude-sonnet-4-6`) and `timeoutMs` (default `300000`) — the two tunable parameters that govern every `ClaudeAgentRunner` instance. |
| **Phase (lifecycle)** | A named checkpoint within a single `AgentRun` (e.g., `"construction"`, `"dispatch"`, `"extraction"`) recorded on `AgentRunnerError` so callers know exactly where in the invocation lifecycle the failure occurred. |
| **AgentInvocation** | The input record passed to `IAgentRunner.run()` by the orchestrator, containing `skill`, `agent`, `mode`, and `payload`; `ClaudeAgentRunner` serializes this into the user message sent to the Anthropic API. |
