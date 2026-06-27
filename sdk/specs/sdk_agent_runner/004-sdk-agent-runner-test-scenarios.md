# Test Scenarios — SDK Agent Runner (F003)

Domain: `sdk_agent_runner`
Project: `sdk`
Sources: `003-sdk-agent-runner-tactical-design.md`

---

## Test Infrastructure

- Test file: `sdk/src/agent-runner/__tests__/ClaudeAgentRunner.test.ts`
- Mock strategy: `jest.mock('@anthropic-ai/sdk')` at the top of the test file. All tests use the mocked `Anthropic` client — no real HTTP calls ever occur.
- Environment: `process.env.ANTHROPIC_API_KEY` is set to `'test-api-key'` in `beforeEach` and deleted in `afterEach` to ensure isolation.
- Fake invocation fixture used across scenarios:

```typescript
const fakeInvocation: AgentInvocation = {
  skill: 'tdd-orchestrator',
  agent: 'developer',
  mode: 'autonomous',
  payload: { featureId: 'F003', taskId: 'T01' },
}
```

---

## Scenario TS01 — Happy Path

**Title**: Successful invocation returns rawOutput and extractedJson from markdown fences

**Given**:
- `ANTHROPIC_API_KEY` is set to `'test-api-key'`.
- `Anthropic.messages.create` is mocked to resolve with `{ content: [{ type: 'text', text: '```json\n{"result":"ok"}\n```' }] }`.

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- `AgentOutput.raw` equals `'```json\n{"result":"ok"}\n```'`.
- `AgentOutput.artefacts` is `undefined` (because `extractedJson` is `{ result: 'ok' }` which is a `Record<string, string>` — so `artefacts` equals `{ result: 'ok' }`).
- No error is thrown.

**Mocking strategy**: `mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '...' }] })`.

**Assertion**: `expect(output.raw).toBe('```json\n{"result":"ok"}\n```')` and `expect(output.artefacts).toEqual({ result: 'ok' })`.

---

## Scenario TS02 — JSON in Markdown Fences

**Title**: Extraction finds and parses a ```json code fence in rawOutput

**Given**:
- `Anthropic.messages.create` resolves with a single text block containing prose followed by a ` ```json ` fence enclosing `{ "status": "done", "score": "9" }`.

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- `AgentOutput.raw` contains the full prose and fence.
- `AgentOutput.artefacts` equals `{ status: 'done', score: '9' }`.

**Mocking strategy**: `mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Analysis complete.\n```json\n{"status":"done","score":"9"}\n```' }] })`.

**Assertion**: `expect(output.artefacts).toEqual({ status: 'done', score: '9' })`.

---

## Scenario TS03 — Bare JSON

**Title**: Extraction finds a bare JSON object in rawOutput when no markdown fence is present

**Given**:
- `Anthropic.messages.create` resolves with a text block containing `'Here is the result: {"verdict":"PASS","reason":"all good"}'`.

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- Extraction strategy falls through the fences check (no ` ``` ` present).
- Bare substring extraction finds `{` at position and parses the JSON.
- `AgentOutput.artefacts` equals `{ verdict: 'PASS', reason: 'all good' }`.

**Mocking strategy**: `mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Here is the result: {"verdict":"PASS","reason":"all good"}' }] })`.

**Assertion**: `expect(output.artefacts).toEqual({ verdict: 'PASS', reason: 'all good' })`.

---

## Scenario TS04 — No JSON in rawOutput

**Title**: Extraction returns null when rawOutput is plain prose with no JSON

**Given**:
- `Anthropic.messages.create` resolves with `{ content: [{ type: 'text', text: 'The implementation looks correct.' }] }`.

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- `AgentOutput.raw` equals `'The implementation looks correct.'`.
- `AgentOutput.artefacts` is `undefined` (extractedJson is null, isStringRecord returns false).
- No error is thrown.

**Mocking strategy**: `mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'The implementation looks correct.' }] })`.

**Assertion**: `expect(output.raw).toBe('The implementation looks correct.')` and `expect(output.artefacts).toBeUndefined()`.

---

## Scenario TS05 — Timeout

**Title**: AgentRunnerError(TIMEOUT) is thrown when the API does not respond within timeoutMs

**Given**:
- `AgentRunnerConfig.timeoutMs` is set to `50` (50 ms) for this test.
- `Anthropic.messages.create` is mocked to return a promise that never resolves (simulated by `new Promise(() => {})`).

**When**: `runner.run(fakeInvocation)` is called and awaited.

**Then**:
- The call rejects with an `AgentRunnerError`.
- `error.code === AgentRunnerErrorCode.TIMEOUT`.
- `error.skill === 'tdd-orchestrator'`.
- `error.phase === 'dispatch'`.

**Mocking strategy**:
```typescript
mockCreate.mockReturnValue(new Promise(() => {}))
jest.useFakeTimers()
// advance timers by > 50ms after calling run()
jest.advanceTimersByTime(100)
```

**Assertion**:
```typescript
await expect(runner.run(fakeInvocation)).rejects.toMatchObject({
  code: AgentRunnerErrorCode.TIMEOUT,
  skill: 'tdd-orchestrator',
  phase: 'dispatch',
})
```

---

## Scenario TS06 — Missing API Key at Construction

**Title**: Constructor throws AgentRunnerError(MISSING_API_KEY) when ANTHROPIC_API_KEY is absent

**Given**:
- `ANTHROPIC_API_KEY` is deleted from `process.env` before constructing the runner.

**When**: `new ClaudeAgentRunner()` is called.

**Then**:
- The constructor throws an `AgentRunnerError`.
- `error.code === AgentRunnerErrorCode.MISSING_API_KEY`.
- `error.skill === 'unknown'`.
- `error.phase === 'construction'`.
- `error.cause` is `undefined`.

**Mocking strategy**: `delete process.env.ANTHROPIC_API_KEY` in test setup; no mock on `messages.create` needed (constructor throws before client is used).

**Assertion**:
```typescript
expect(() => new ClaudeAgentRunner()).toThrow(
  expect.objectContaining({
    code: AgentRunnerErrorCode.MISSING_API_KEY,
    skill: 'unknown',
    phase: 'construction',
  })
)
```

---

## Scenario TS07 — API Error 4xx

**Title**: AgentRunnerError(API_ERROR) is thrown when Anthropic responds with a 4xx status

**Given**:
- `Anthropic.messages.create` is mocked to throw an `Anthropic.APIStatusError` with status `401`.

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- The call rejects with an `AgentRunnerError`.
- `error.code === AgentRunnerErrorCode.API_ERROR`.
- `error.skill === 'tdd-orchestrator'`.
- `error.phase === 'dispatch'`.
- `error.cause` is the original `APIStatusError` instance.

**Mocking strategy**:
```typescript
const apiError = new Anthropic.APIStatusError(401, { error: 'Unauthorized' }, 'Unauthorized', new Headers())
mockCreate.mockRejectedValue(apiError)
```

**Assertion**:
```typescript
await expect(runner.run(fakeInvocation)).rejects.toMatchObject({
  code: AgentRunnerErrorCode.API_ERROR,
  phase: 'dispatch',
  cause: apiError,
})
```

---

## Scenario TS08 — API Error 5xx

**Title**: AgentRunnerError(API_ERROR) is thrown when Anthropic responds with a 5xx status

**Given**:
- `Anthropic.messages.create` is mocked to throw an `Anthropic.APIStatusError` with status `503`.

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- The call rejects with an `AgentRunnerError`.
- `error.code === AgentRunnerErrorCode.API_ERROR`.
- `error.phase === 'dispatch'`.
- `error.cause` is the original `APIStatusError` with status `503`.

**Mocking strategy**: Same as TS07, status `503`.

**Assertion**: `expect(error.code).toBe(AgentRunnerErrorCode.API_ERROR)` and `expect((error.cause as Anthropic.APIStatusError).status).toBe(503)`.

---

## Scenario TS09 — Network Failure

**Title**: AgentRunnerError(NETWORK_ERROR) is thrown when the request cannot reach the server

**Given**:
- `Anthropic.messages.create` is mocked to throw an `Anthropic.APIConnectionError` (no HTTP response).

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- The call rejects with an `AgentRunnerError`.
- `error.code === AgentRunnerErrorCode.NETWORK_ERROR`.
- `error.skill === 'tdd-orchestrator'`.
- `error.phase === 'dispatch'`.
- `error.cause` is the original `APIConnectionError` instance.

**Mocking strategy**:
```typescript
const connError = new Anthropic.APIConnectionError({ message: 'ECONNREFUSED' })
mockCreate.mockRejectedValue(connError)
```

**Assertion**:
```typescript
await expect(runner.run(fakeInvocation)).rejects.toMatchObject({
  code: AgentRunnerErrorCode.NETWORK_ERROR,
  cause: connError,
})
```

---

## Scenario TS10 — Custom Model

**Title**: ClaudeAgentRunner uses the model from config instead of the default

**Given**:
- `new ClaudeAgentRunner({ model: 'claude-opus-4-5' })` is constructed.
- `Anthropic.messages.create` is mocked to resolve with a text block `'done'`.

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- `Anthropic.messages.create` was called with `model: 'claude-opus-4-5'`.

**Mocking strategy**: Spy on `mockCreate` and inspect call arguments.

**Assertion**:
```typescript
expect(mockCreate).toHaveBeenCalledWith(
  expect.objectContaining({ model: 'claude-opus-4-5' })
)
```

---

## Scenario TS11 — Empty Response

**Title**: Empty API response returns AgentOutput with raw="" and no artefacts

**Given**:
- `Anthropic.messages.create` resolves with `{ content: [{ type: 'text', text: '' }] }`.

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- `AgentOutput.raw === ''`.
- `AgentOutput.artefacts` is `undefined`.
- No error is thrown.

**Mocking strategy**: `mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '' }] })`.

**Assertion**: `expect(output.raw).toBe('')` and `expect(output.artefacts).toBeUndefined()`.

---

## Scenario TS12 — Large Response

**Title**: A 100 KB response is returned without truncation

**Given**:
- A string of length `102400` (100 KB) is constructed as `'x'.repeat(102400)`.
- `Anthropic.messages.create` resolves with `{ content: [{ type: 'text', text: largeString }] }`.

**When**: `runner.run(fakeInvocation)` is called.

**Then**:
- `AgentOutput.raw.length === 102400`.
- `AgentOutput.raw === largeString`.
- No error is thrown.

**Mocking strategy**: `mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'x'.repeat(102400) }] })`.

**Assertion**: `expect(output.raw.length).toBeGreaterThan(50000)` and `expect(output.raw).toBe(largeString)`.

---

## Scenario TS13 — AgentRunnerError Fields Completeness

**Title**: All required fields are present and correctly typed on every error variant

**Given**: Three sub-cases, one per tested error code:
- Sub-case A (TIMEOUT): timer fires, `error.code = TIMEOUT`, `error.skill = 'tdd-orchestrator'`, `error.phase = 'dispatch'`, `error.cause` is set.
- Sub-case B (API_ERROR): mock throws `APIStatusError(429)`, `error.code = API_ERROR`, `error.skill = 'tdd-orchestrator'`, `error.phase = 'dispatch'`, `error.cause instanceof Anthropic.APIStatusError`.
- Sub-case C (MISSING_API_KEY): no env var, constructor throws, `error.code = MISSING_API_KEY`, `error.skill = 'unknown'`, `error.phase = 'construction'`, `error.cause === undefined`.

**When**: Each sub-case is executed as above.

**Then** (for each sub-case):
- `error instanceof AgentRunnerError` is `true`.
- `error.name === 'AgentRunnerError'`.
- `error.code` matches the expected `AgentRunnerErrorCode`.
- `error.skill` is a non-empty string matching the invocation skill or `'unknown'`.
- `error.phase` is a non-empty string (`'construction'` or `'dispatch'`).
- `error.cause` is either an `Error` instance or `undefined` — never `null`.
- `error.message` is a non-empty string describing the failure.

**Mocking strategy**: Each sub-case uses the same mock setup as its corresponding scenario (TS05 for TIMEOUT, TS07 for API_ERROR, TS06 for MISSING_API_KEY).

**Assertion** (example for sub-case B):
```typescript
expect(error).toBeInstanceOf(AgentRunnerError)
expect(error.name).toBe('AgentRunnerError')
expect(error.code).toBe(AgentRunnerErrorCode.API_ERROR)
expect(error.skill).toBe('tdd-orchestrator')
expect(error.phase).toBe('dispatch')
expect(error.cause).toBeInstanceOf(Anthropic.APIStatusError)
expect(error.message).not.toBe('')
```
