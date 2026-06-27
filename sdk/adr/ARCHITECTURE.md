# Architecture — harness-kit

## What this project is

`harness-kit` is a meta-harness: a TypeScript SDK and a set of Claude Code skill definitions that together implement an autonomous TDD orchestration loop. The SDK drives agents through a fixed state machine; the skill definitions tell Claude Code how to invoke those agents.

---

## Repository Layout

```
sdk/                  # npm package — harness-kit-sdk (TypeScript, Vitest)
docs/
  adr/                # Architecture Decision Records (this folder)
  feature/            # One file per completed feature — module-level orientation docs
  specs/              # DDD design artefacts per domain (problem space, context map, etc.)
  workflow/           # Operator-facing runbooks and playbooks
  product/            # Live orchestration state files (BACKLOG.md, DEVELOPMENT-STATE.md, etc.)
agents/               # Agent persona definition files
skills/               # Claude Code skill definitions
```

---

## SDK Architecture — Ports-and-Adapters

The `sdk/` package follows a strict Ports-and-Adapters (Hexagonal) structure.

**Domain core** (`sdk/src/orchestrator/`) has zero runtime dependencies outside the Node standard library. It owns the state machine and all transition logic.

**Inbound port** — `IFileStateManager` — abstracts all filesystem reads and writes. The default adapter is `FileStateManager`. Tests inject `FakeFileStateManager`.

**Outbound port** — `IAgentRunner` — abstracts agent invocation. Callers inject their own implementation. `NullAgentRunner` is the no-op stub; `ClaudeAgentRunner` is the production implementation backed by `@anthropic-ai/sdk`.

**Supporting modules** (no external deps, pure functions or thin adapters):

| Module | Role |
|---|---|
| `StateMachine` | Pure phase transition function |
| `ReentryResolver` | Ordered predicate table — first match wins |
| `ValidationGate` | Pure `evaluate(scores)` → `Verdict` |
| `JsonExtractionProtocol` | Never-throws JSON parser returning an outcome union |
| `ContextAssembler` | Builds per-phase `ContextPayload` from `OrchestratorState` |
| `FileStateManager` | Atomic markdown/JSON read-write adapter |

---

## Key Conventions

- **Atomic writes** — all file mutations go through write-to-temp-then-rename. Crash leaves a `.tmp` orphan, not a corrupt file.
- **Never-throws extraction** — `JsonExtractionProtocol` returns `ExtractionResult | ExtractionError`. Callers use type guards; they never catch.
- **Phase persistence** — `currentPhase` is written to `BOOTSTRAP-CONFIG.json` after every transition for crash recovery.
- **Domain parameter guard** — `writeReworkLog` validates its `domain` argument with `^[a-zA-Z0-9_-]+$` before constructing paths (path traversal mitigation).
- **Error discrimination via `err.name`** — SDK error classes (e.g., Anthropic's `APIStatusError`, `APIConnectionError`) are identified by checking `err.name` as a string, not with `instanceof`. This is required for Vitest compatibility: mocks constructed in test files cannot replicate the SDK prototype chain across module boundaries, so `instanceof` always returns `false` against mocks.
- **External dependency scope** — `@anthropic-ai/sdk` is the only third-party runtime dependency in `sdk/`. It is consumed exclusively by `ClaudeAgentRunner`. All orchestrator domain logic remains dependency-free.
- **Dual JSON extraction paths** — `JsonExtractionProtocol` (orchestrator) and `ClaudeAgentRunner`'s internal `extractJson` are intentionally separate. The former serves Phase C metric parsing; the latter populates `AgentOutput.artefacts`. Merging them would couple the agent runner to the orchestrator's extraction utility without benefit.

---

## Cross-References

- Module detail: `./docs/feature/` (one file per completed feature)
- DDD design artefacts: `./docs/specs/` (problem space, context map, tactical design, test scenarios per domain)
