# Tactical Design — SDK Agent Runner (F003)

Domain: `sdk_agent_runner`
Project: `sdk`
Sources: `001-sdk-agent-runner-problem-space.md`, `002-sdk-agent-runner-context-map.md`

---

## Section 1 — Value Objects

### `AgentRunnerConfig`

Immutable configuration record governing every `ClaudeAgentRunner` instance.

```typescript
// sdk/src/agent-runner/AgentRunnerConfig.ts

export interface AgentRunnerConfig {
  readonly model: string       // Anthropic model identifier
  readonly timeoutMs: number   // Max ms to wait for a response before aborting
}

export const DEFAULT_AGENT_RUNNER_CONFIG: AgentRunnerConfig = {
  model: 'claude-sonnet-4-6',
  timeoutMs: 300_000,          // 5 minutes
}
```

Rules:
- `model` must be a non-empty string; no validation beyond non-empty (model names evolve).
- `timeoutMs` must be a positive integer; checked at construction.
- Constructed by merging caller-supplied `Partial<AgentRunnerConfig>` with `DEFAULT_AGENT_RUNNER_CONFIG`. Object is frozen (`Object.freeze`) before use.

### `AgentResult` (internal to `ClaudeAgentRunner`)

A read-only value produced after a successful API call and extraction pass. It is mapped to `AgentOutput` before being returned to the caller.

```typescript
// Internal — not exported from sdk/src/index.ts

interface AgentResult {
  readonly rawOutput: string          // Full text from all response content blocks
  readonly extractedJson: unknown | null  // Parsed JSON value, or null if none found
}
```

This type is internal. The public return type remains `AgentOutput` (from `sdk_core`). `AgentResult.rawOutput` maps to `AgentOutput.raw`; `AgentResult.extractedJson` is used to populate `AgentOutput.artefacts` when applicable.

---

## Section 2 — Error Type

### `AgentRunnerError`

```typescript
// sdk/src/agent-runner/AgentRunnerError.ts

export enum AgentRunnerErrorCode {
  MISSING_API_KEY = 'MISSING_API_KEY',
  TIMEOUT         = 'TIMEOUT',
  API_ERROR       = 'API_ERROR',
  NETWORK_ERROR   = 'NETWORK_ERROR',
}

export class AgentRunnerError extends Error {
  readonly code: AgentRunnerErrorCode
  readonly skill: string      // The AgentInvocation.skill being executed when the error occurred
  readonly phase: string      // Lifecycle checkpoint: 'construction' | 'dispatch' | 'extraction'
  readonly cause: Error | undefined

  constructor(params: {
    code: AgentRunnerErrorCode
    skill: string
    phase: string
    message: string
    cause?: Error
  }) {
    super(params.message)
    this.name = 'AgentRunnerError'
    this.code = params.code
    this.skill = params.skill
    this.phase = params.phase
    this.cause = params.cause
  }
}
```

Field semantics:

| Field | Type | Meaning |
|---|---|---|
| `code` | `AgentRunnerErrorCode` | Machine-readable discriminant for the failure mode |
| `skill` | `string` | Value of `AgentInvocation.skill` at the time of failure; `'unknown'` during construction before invocation |
| `phase` | `string` | Named lifecycle checkpoint where the failure occurred |
| `cause` | `Error \| undefined` | Original error from the Anthropic SDK or abort; absent for `MISSING_API_KEY` |

Lifecycle phase values:

| Phase string | When used |
|---|---|
| `'construction'` | `MISSING_API_KEY` thrown in the constructor |
| `'dispatch'` | `TIMEOUT`, `API_ERROR`, or `NETWORK_ERROR` thrown during `messages.create` |
| `'extraction'` | Reserved for future use; not thrown in this feature |

---

## Section 3 — Aggregate / Entity

This feature has no entities or aggregates.

`ClaudeAgentRunner` holds no mutable domain state between invocations. The Anthropic client instance (`this.#client`) is an infrastructure concern, not a domain entity. Each call to `run()` is isolated: it creates its own `AbortController` and timer, makes one API call, and resolves or rejects. There is no identity, lifecycle, or invariant to protect across calls.

---

## Section 4 — `ClaudeAgentRunner` Class

### Signature

```typescript
// sdk/src/agent-runner/ClaudeAgentRunner.ts

import Anthropic from '@anthropic-ai/sdk'
import type { IAgentRunner } from './IAgentRunner'
import type { AgentInvocation, AgentOutput } from './types'
import { AgentRunnerConfig, DEFAULT_AGENT_RUNNER_CONFIG } from './AgentRunnerConfig'
import { AgentRunnerError, AgentRunnerErrorCode } from './AgentRunnerError'

export class ClaudeAgentRunner implements IAgentRunner {
  readonly #config: AgentRunnerConfig
  readonly #client: Anthropic

  constructor(config?: Partial<AgentRunnerConfig>)
  run(invocation: AgentInvocation): Promise<AgentOutput>
}
```

### Constructor Behaviour

1. Merge `config` with `DEFAULT_AGENT_RUNNER_CONFIG` using object spread: `{ ...DEFAULT_AGENT_RUNNER_CONFIG, ...config }`.
2. Freeze the merged config with `Object.freeze`.
3. Read `process.env.ANTHROPIC_API_KEY`.
4. If absent or empty string: throw `new AgentRunnerError({ code: MISSING_API_KEY, skill: 'unknown', phase: 'construction', message: 'ANTHROPIC_API_KEY environment variable is not set' })`.
5. Instantiate `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` and store as `this.#client`.

No network activity occurs in the constructor.

### `run(invocation: AgentInvocation): Promise<AgentOutput>`

#### Step 1 — Arm timeout

```
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), this.#config.timeoutMs)
```

#### Step 2 — Dispatch to Anthropic

Call `this.#client.messages.create` with:

| Parameter | Value |
|---|---|
| `model` | `this.#config.model` |
| `max_tokens` | `8192` (fixed constant) |
| `messages` | `[{ role: 'user', content: buildUserMessage(invocation) }]` |
| `signal` | `controller.signal` |

`buildUserMessage(invocation: AgentInvocation): string` is a private method that serializes the invocation to a user message string. The exact format:

```
Skill: <invocation.skill>
Agent: <invocation.agent>

<JSON.stringify(invocation.payload, null, 2)>
```

The prompt is NOT further augmented — the orchestrator's `ContextAssembler` has already assembled all relevant context into `invocation.payload`.

#### Step 3 — Collect raw output

On success, clear the timer (`clearTimeout(timer)`). Concatenate all `content` blocks of type `'text'`:

```
const rawOutput = response.content
  .filter(block => block.type === 'text')
  .map(block => block.text)
  .join('')
```

Empty response (`rawOutput === ''`) is valid — not an error.

#### Step 4 — Extract JSON

Apply the extraction strategy in order. Stop at first success:

1. Find a markdown code fence: `` ```json\n<body>\n``` `` — extract `<body>` and `JSON.parse` it.
2. Find the first `{` or `[` in `rawOutput` and the matching closing `}` or `]` — attempt `JSON.parse` on the substring.
3. If both fail: `extractedJson = null`.

Extraction failures (malformed JSON) result in `extractedJson = null`, not a thrown error.

#### Step 5 — Return `AgentOutput`

```typescript
return {
  raw: rawOutput,
  artefacts: isStringRecord(extractedJson) ? extractedJson : undefined,
}
```

`isStringRecord` is a private type guard that returns `true` only when `extractedJson` is a non-null object whose values are all strings.

#### Error handling

Wrap the entire `messages.create` call in try/catch:

```
catch (err) {
  clearTimeout(timer)
  if (controller.signal.aborted) {
    throw new AgentRunnerError({ code: TIMEOUT, skill: invocation.skill, phase: 'dispatch', message: '...', cause: err as Error })
  }
  if (isApiStatusError(err)) {  // HTTP 4xx / 5xx
    throw new AgentRunnerError({ code: API_ERROR, skill: invocation.skill, phase: 'dispatch', message: '...', cause: err })
  }
  // All other errors treated as network failure
  throw new AgentRunnerError({ code: NETWORK_ERROR, skill: invocation.skill, phase: 'dispatch', message: '...', cause: err as Error })
}
```

`isApiStatusError` checks whether the caught error is an instance of `Anthropic.APIStatusError` (exported by `@anthropic-ai/sdk`).

---

## Section 5 — Module Structure

Files created in this feature under `sdk/src/agent-runner/`:

| File | Status | Content |
|---|---|---|
| `ClaudeAgentRunner.ts` | NEW | Production `IAgentRunner` implementation |
| `AgentRunnerError.ts` | NEW | `AgentRunnerErrorCode` enum + `AgentRunnerError` class |
| `AgentRunnerConfig.ts` | NEW | `AgentRunnerConfig` interface + `DEFAULT_AGENT_RUNNER_CONFIG` constant |

Files that already exist and are NOT modified:

| File | Reason |
|---|---|
| `IAgentRunner.ts` | Port interface — defined by `sdk_core`; frozen |
| `NullAgentRunner.ts` | Retained as test double and fallback stub |
| `types.ts` | `AgentInvocation`, `AgentOutput`, `ContextPayload` — defined by `sdk_core`; frozen |

`sdk/src/index.ts` is updated to add the following exports:

```typescript
export { ClaudeAgentRunner } from './agent-runner/ClaudeAgentRunner'
export { AgentRunnerError, AgentRunnerErrorCode } from './agent-runner/AgentRunnerError'
export type { AgentRunnerConfig } from './agent-runner/AgentRunnerConfig'
```

Test files are created under `sdk/src/agent-runner/__tests__/`:

| File | Content |
|---|---|
| `AgentRunnerConfig.test.ts` | Tests for config merging and freeze behaviour |
| `AgentRunnerError.test.ts` | Tests for error field assignment and inheritance |
| `ClaudeAgentRunner.test.ts` | All integration-level unit tests (mocked SDK) |

---

## Section 6 — Ordered Dev Tasks

Each task: failing test written first → minimal implementation → tests pass → commit.

```
T01 | Define AgentRunnerConfig interface + DEFAULT_AGENT_RUNNER_CONFIG constant + Object.freeze merge helper | AgentRunnerConfig.ts, AgentRunnerConfig.test.ts
T02 | Define AgentRunnerErrorCode enum + AgentRunnerError class with all four fields | AgentRunnerError.ts, AgentRunnerError.test.ts
T03 | ClaudeAgentRunner constructor — reads ANTHROPIC_API_KEY, throws AgentRunnerError(MISSING_API_KEY) when absent, stores frozen config and Anthropic client | ClaudeAgentRunner.ts, ClaudeAgentRunner.test.ts (constructor tests)
T04 | ClaudeAgentRunner.run() happy path — mock Anthropic client returns single text block, rawOutput collected, AgentOutput.raw matches | ClaudeAgentRunner.test.ts (happy path)
T05 | JSON extraction — markdown fences case: rawOutput contains ```json block, extractedJson parsed correctly | ClaudeAgentRunner.test.ts (extraction: fences)
T06 | JSON extraction — bare JSON case: rawOutput contains raw JSON object without fences, extractedJson parsed correctly | ClaudeAgentRunner.test.ts (extraction: bare)
T07 | JSON extraction — no JSON case: rawOutput is plain prose, extractedJson = null | ClaudeAgentRunner.test.ts (extraction: none)
T08 | Timeout enforcement — AbortController fires after timeoutMs, request is aborted, AgentRunnerError(TIMEOUT) thrown with skill and phase set | ClaudeAgentRunner.test.ts (timeout)
T09 | API error 4xx/5xx — mock Anthropic throws APIStatusError, caught and wrapped as AgentRunnerError(API_ERROR) with cause set | ClaudeAgentRunner.test.ts (api error)
T10 | Network failure — mock Anthropic throws APIConnectionError, caught and wrapped as AgentRunnerError(NETWORK_ERROR) with cause set | ClaudeAgentRunner.test.ts (network error)
T11 | Custom model config — constructor accepts Partial<AgentRunnerConfig> with model override, messages.create called with that model | ClaudeAgentRunner.test.ts (custom model)
T12 | Empty response — API returns content blocks where all text is empty string, rawOutput = "", extractedJson = null, AgentOutput returned without error | ClaudeAgentRunner.test.ts (empty response)
T13 | Large response — API returns 100 KB text block, rawOutput.length > 50000, no truncation applied, AgentOutput.raw matches full string | ClaudeAgentRunner.test.ts (large response)
T14 | Export ClaudeAgentRunner, AgentRunnerError, AgentRunnerErrorCode, AgentRunnerConfig from sdk/src/index.ts; run tsc --noEmit; verify zero errors | index.ts, (tsc check)
```
