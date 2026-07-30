# Agent Invocations in Harness Kit SDK

Reference for all `invokeAgent` calls executed during the orchestrator lifecycle. For an overview of the pipeline, see [README.md](./README.md).

---

## Phase → Agent mapping

| Phase | Skill (metadata) | Agent | Prompt Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Bootstrap** | `autonomous-orchestrator:bootstrap` | `software-architect` | Custom `prompt` string | Parses project scope and generates `BACKLOG.md` with feature IDs, priorities and statuses. |
| **Planning** (Phase A) | `scope-refinement` | `software-architect` | `ContextAssembler.buildPlanningPayload()` | Refines feature scope, generates tactical design specs and test scenarios under `docs/specs/{domain}/`. |
| **Development** (Phase B) | `tdd-orchestrator` | `developer-backend` | `ContextAssembler.buildDevelopmenPayload()` | Executes TDD cycles (red → green → refactor). Re-runs with rework log on retry. |
| **Review** (Phase C) — Tech Lead | `the-grumpy-tech-lead` | `harness-tech-lead` | `ContextAssembler.buildReviewPayload()` | Technical code review. Returns `scoreTL` in JSON. |
| **Review** (Phase C) — Adversarial QA | `adversarial-qa` | `harness-qa` | `ContextAssembler.buildReviewPayload()` | Edge-case and security testing. Returns `scoreAdv`, `hasHighCriticalVuln`, `isCrashing` in JSON. |
| **Memory** (Phase E) | `project-memory` | `developer-backend` | `ContextAssembler.buildMemoryPayload()` | Writes permanent feature records to `docs/feature/{domain}.md`. |
| **Transition** (Phase F) | _(none)_ | _(none)_ | _(none)_ | Advances to next NOT_STARTED feature or cascades BLOCKED status. When all features done → DEPLOY. |
| **Deploy** (Phase DEPLOY) | _(none)_ | _(none)_ | _(none)_ | Runs `git add --all`, `git commit`, `git push` for each project path. No conflict resolution. Skippable via `--skip-deploy`. |

> [!IMPORTANT]
> **Phase C calls are sequential, not parallel.** The tech lead agent completes before the adversarial QA agent starts. Both receive the same payload.

> [!NOTE]
> The `skill` field is **metadata only** — used for logging, progress display, and token ledger. The runner does not load or resolve any skill file at runtime. Agent behavior is driven by the `prompt` or `payload`.

---

## Steering rules

Every phase payload is enriched with **steering rules** at the moment the phase starts. Rules are loaded from `steeringRules` inside `BOOTSTRAP-CONFIG.json` and merged into the agent prompt before dispatch.

### `SteeringRulesConfig` shape

```typescript
interface SteeringRulesConfig {
  user?:      string[]   // global — injected into every phase
  bootstrap?: string[]
  planning?:   string[]
  implementation?:   string[]
  review?:   string[]
  memory?:   string[]
}
```

The `user` key is **global**: its rules are prepended to every phase's rule list, regardless of which phase is running.

### Default rules (`createDefaultSteeringRules`)

Defined in [`src/file-state/types.ts`](./src/file-state/types.ts):

| Key | Default rules |
| :--- | :--- |
| `user` | _(empty — populated via `--steering` flag or `hrns init` wizard)_ |
| `bootstrap` | Granularity rule: each feature is one deliverable chunk. Never mix multiple unrelated projects in a single feature. |
| `planning` | • Min 1 / max 5 tasks per tactical-design doc (10 total max)<br>• Classify scope as `LOW` (basic CRUD, minor enhancements) → generate only `003` + `004` docs<br>• Classify scope as `HIGH` (new core features, cross-domain, integrations) → generate all docs (`001`–`004`) |
| `implementation` | _(empty by default)_ |
| `review` | • `harness-tech-lead` must write its review JSON to `docs/specs/${domain}/TL.json`<br>• `harness-qa` must write its review JSON to `docs/specs/${domain}/QA.json` |
| `memory` | _(empty by default)_ |

### Adding rules

Rules can be added in three ways:

1. **`hrns init` wizard** — interactive prompts per phase populate `BOOTSTRAP-CONFIG.json`.
2. **`--steering` flag** — appends a rule to the `user` (global) key for the current run:
   ```bash
   hrns run --steering "prefer async/await over promise chains"
   ```
3. **Direct edit** — open `docs/product/BOOTSTRAP-CONFIG.json` and append strings to any phase array:
   ```json
   {
     "steeringRules": {
       "implementation": ["Always write JSDoc for public functions"]
     }
   }
   ```

> [!NOTE]
> Rules are plain strings. They are injected verbatim into the agent prompt each time a phase starts. Keep them concise and directive — the agent treats them as mandatory constraints, not suggestions.

---

## Invocation dispatch internals

When `invokeAgent` is called:

1. **Timeout guard** — `AbortController` created with `config.timeoutMs`.
2. **Progress UI** — `TerminalProgress.startSpinner()` shows the current phase and agent name.
3. **Runner call** — forwarded to the registered `IAgentRunner.run()`.
4. **Token recording** — `output.usage` recorded to `docs/product/tokens.jsonl` via `TokenLedger`.
5. **Spinner stop** — always called in the `finally` block.

### Timeout handling

Each agent invocation runs under a timeout controlled by `timeoutMs` (configured in `settings.json` at the runner or phase level). If the timeout expires before the agent responds, the `AbortController` fires, the runner throws, and the orchestrator persists the current phase state to disk before halting.

Because state is always persisted on exit, **the session can be resumed** at any time:

```bash
hrns run --resume
```

The orchestrator re-enters at the exact phase that was interrupted. To increase the timeout for long-running phases before resuming, update `settings.json`:

```json
{
  "claude": {
    "phases": {
      "implementation": { "timeoutMs": 3600000 }
    }
  }
}
```

> [!TIP]
> The default `timeoutMs` is `1800000` (30 min) at the runner level. Phase-level `timeoutMs` takes precedence over the runner-level default.

---

## Loop safety guards

The main orchestration loop in [`HarnessOrchestrator.ts`](./src/orchestrator/HarnessOrchestrator.ts) runs until the pipeline reaches `Phase.HALTED`. Two independent counters protect against runaway execution:

| Guard | Constant | Trigger |
| :--- | :--- | :--- |
| **Global iteration cap** | `MAX_ITERATIONS = 500` | Fires when the total number of loop ticks exceeds 500, regardless of phase. |
| **Consecutive phase cap** | `MAX_PHASE_ITERATIONS = 3` | Fires when the same phase repeats more than 3 consecutive ticks without advancing. |

### Behavior on breach

When either limit is exceeded, the orchestrator checks whether it is running in an interactive terminal (`process.stdout.isTTY && process.stdin.isTTY`):

- **Interactive (TTY)** — prompts the developer:
  ```
  HarnessOrchestrator: exceeded 500 iterations — possible infinite loop at phase IMPLEMENTATION.
  Do you want to continue anyway? (Y/n)
  ```
  Answering **Y** resets the breached counter to zero and the loop continues. Answering **N** throws and halts.

- **Non-interactive (CI / test env)** — throws immediately without prompting:
  ```
  HarnessOrchestrator: exceeded 500 iterations — possible infinite loop at phase IMPLEMENTATION
  ```

> [!WARNING]
> A breach of `MAX_PHASE_ITERATIONS` almost always indicates a phase handler that is not advancing state correctly (e.g., a feature stuck between B and C due to a score parsing failure). Investigate `DEVELOPMENT-STATE.md` and `DECISIONS.md` before choosing to continue.
