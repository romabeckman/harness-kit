# Agent Invocations in Harness Kit SDK

Reference for all `invokeAgent` calls executed during the orchestrator lifecycle. For an overview of the pipeline, see [README.md](./README.md).

---

## Phase → Agent mapping

| Phase | Skill (metadata) | Agent | Prompt Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Bootstrap** | `autonomous-orchestrator:bootstrap` | `software-architect` | Custom `prompt` string | Parses project scope and generates `BACKLOG.md` with feature IDs, priorities and statuses. |
| **Phase A** — Planning | `scope-refinement` | `software-architect` | `ContextAssembler.buildPhaseAPayload()` | Refines feature scope, generates tactical design specs and test scenarios under `docs/specs/{domain}/`. |
| **Phase B** — Implementation | `tdd-orchestrator` | `developer-backend` | `ContextAssembler.buildPhaseBPayload()` | Executes TDD cycles (red → green → refactor). Re-runs with rework log on retry. |
| **Phase C** — Tech Lead review | `the-grumpy-tech-lead` | `harness-tech-lead` | `ContextAssembler.buildPhaseCPayload()` | Technical code review. Returns `scoreTL` in JSON. |
| **Phase C** — Adversarial QA | `adversarial-qa` | `harness-qa` | `ContextAssembler.buildPhaseCPayload()` | Edge-case and security testing. Returns `scoreAdv`, `hasHighCriticalVuln`, `isCrashing` in JSON. |
| **Phase D** — State Check | _(none)_ | _(none)_ | _(none)_ | Pure state management — evaluates completion criteria, no agent call. |
| **Phase E** — Memory | `project-memory` | `developer-backend` | `ContextAssembler.buildPhaseEPayload()` | Writes permanent feature records to `docs/feature/{domain}.md`. |

> [!IMPORTANT]
> **Phase C calls are sequential, not parallel.** The tech lead agent completes before the adversarial QA agent starts. Both receive the same payload.

> [!NOTE]
> The `skill` field is **metadata only** — used for logging, progress display, and token ledger. The runner does not load or resolve any skill file at runtime. Agent behavior is driven by the `prompt` or `payload`.

---

## Prompt construction

Bootstrap passes a custom `prompt` string directly. All other phases use `ContextAssembler` to build a structured payload. When no explicit `prompt` is given, the runner serializes the payload as:

```
Skill: <skill-name>
Mode: autonomous

<JSON payload>
```

---

## Invocation dispatch internals

When `invokeAgent` is called:

1. **Timeout guard** — `AbortController` created with `config.timeoutMs`.
2. **Progress UI** — `TerminalProgress.startSpinner()` shows the current phase and agent name.
3. **Runner call** — forwarded to the registered `IAgentRunner.run()`.
4. **Token recording** — `output.usage` recorded to `docs/product/tokens.jsonl` via `TokenLedger`.
5. **Spinner stop** — always called in the `finally` block.

### Quota / rate-limit handling

If the agent returns an error matching `/rate.?limit|quota|overloaded/i`, the runner throws `AgentRunnerError` with code `QUOTA_EXCEEDED`. The orchestrator persists the current phase to disk and halts gracefully — run `hrns run` to resume.
