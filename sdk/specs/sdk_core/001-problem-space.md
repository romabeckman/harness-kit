# Problem Space — SDK Core (F001)

Domain: `sdk_core`
Feature: HarnessOrchestrator class + state machine

---

## 1. Big Picture Event Storming

The following events represent the complete observable lifecycle of the orchestrator loop when executed programmatically by the SDK.

| # | Domain Event | Trigger / Actor | Resulting State Change |
|---|---|---|---|
| 1 | `OrchestratorInitialized` | Consumer calls `new HarnessOrchestrator(config)` | Config validated; internal state machine set to `BOOTSTRAP` |
| 2 | `BacklogLoaded` | State machine enters `BOOTSTRAP` | `BACKLOG.md` parsed; feature list hydrated in memory |
| 3 | `BootstrapFilesEnsured` | BOOTSTRAP phase completes initialization check | All four product files exist on disk (`BACKLOG.md`, `DEVELOPMENT-STATE.md`, `DECISIONS.md`, `BOOTSTRAP-CONFIG.json`) |
| 4 | `FeatureSelected` | Transition from `BOOTSTRAP` → `PHASE_A` | Next `NOT_STARTED` feature is set as the active feature |
| 5 | `PlanningDelegated` | `PHASE_A` active | `scope-refinement` invoked via `IAgentRunner`; spec documents requested |
| 6 | `SpecsVerified` | `IAgentRunner` returns output | All `004-*-test-scenarios.md` confirmed present on disk |
| 7 | `TasksAppended` | `PHASE_A` completing | Dev tasks extracted from `003-*-tactical-design.md` and appended to `DEVELOPMENT-STATE.md` |
| 8 | `PhaseTransitioned` | Any gate condition met | State machine advances or retries; transition logged to `DECISIONS.md` |
| 9 | `ImplementationDelegated` | `PHASE_B` active, task `NOT_STARTED` | `tdd-orchestrator` invoked via `IAgentRunner`; task set to `IMPLEMENTATION / IN_PROGRESS` |
| 10 | `AgentInvoked` | Orchestrator calls `IAgentRunner.run(...)` | Agent invocation record created; context payload assembled and dispatched |
| 11 | `AgentOutputReceived` | `IAgentRunner` resolves | Raw output stored; JSON Extraction Protocol applied to parse scores or artefact paths |
| 12 | `TDDOutputGenerated` | Phase B agent completes | `TDD-OUTPUT.json` detected on disk; task marked `COMPLETED` |
| 13 | `ValidationDelegated` | `PHASE_C` active | Both `the-grumpy-tech-lead` and `adversarial-qa` invoked in parallel via `IAgentRunner` |
| 14 | `ValidationScoresReceived` | Both validation agents resolve | Score A (TL) and Score B (Adv) extracted; verdict evaluation begins |
| 15 | `ValidationGateEvaluated` | Scores compared against thresholds | One of PASS / RETRY / BLOCK / FAIL verdict emitted |
| 16 | `FeatureCompleted` | Gate verdict is PASS | Feature status → `COMPLETED`; scores written to `BACKLOG.md`; `completedCycles` incremented |
| 17 | `FeatureBlocked` | Gate verdict is BLOCK | Feature status → `BLOCKED`; rationale logged; `completedCycles` incremented |
| 18 | `FeatureFailed` | Gate verdict is FAIL | Feature status → `FAILED`; rationale logged; `completedCycles` incremented |
| 19 | `ReworkInitiated` | Gate verdict is RETRY | `Reworks` incremented; `REWORK-LOG.md` written; all tasks reset to `NOT_STARTED` |
| 20 | `MemoryPersisted` | `PHASE_E` active | `project-memory` skill invoked; `docs/feature/{domain}.md` written or updated |
| 21 | `LoopAdvanced` | `PHASE_D` — executable features remain | Next `NOT_STARTED` / restorable feature selected; loop continues |
| 22 | `LoopHalted` | `PHASE_D` — no executable features remain | All features in terminal state; orchestrator exits `run()` |
| 23 | `CascadeBlocked` | `PHASE_A` — dependency has `Status = BLOCKED` | Feature set to `BLOCKED`; skipped; logged to `DECISIONS.md` |

---

## 2. Subdomain Classification

| Subdomain | Type | Rationale |
|---|---|---|
| **Orchestration Loop** (state machine, phase transitions, verdict gate) | Core | This is the primary differentiator — the entire value of the SDK. Complex, rule-dense, evolves with the skill definition. |
| **File State Management** (read/write BACKLOG, DEVELOPMENT-STATE, DECISIONS, BOOTSTRAP-CONFIG) | Core | The persistent medium of truth. All state is derived from and written to these files. Correctness is non-negotiable. |
| **Agent Runner Port** (IAgentRunner interface, invocation contract, output parsing) | Supporting | Bridges orchestration intent to actual LLM invocation. Decoupled from core logic; implementation lives in F003. |
| **Validation Gate** (threshold evaluation, verdict rules, REWORK-LOG) | Core | Houses the business rules that determine completion and quality. All four verdict branches are domain decisions. |
| **Context Assembler** (minimal context payloads per phase per agent) | Supporting | Enables token-optimized invocations. Derives what each agent needs — no more, no less. |
| **JSON Extraction Protocol** (defensive parsing of agent output) | Generic | Purely mechanical string processing. No domain knowledge. Could be a utility library. |

---

## 3. Ubiquitous Language Glossary

| Term | Definition |
|---|---|
| **Orchestrator** | The `HarnessOrchestrator` class. The single driver of the TDD-Validation-Optimization loop. Never writes code or tests directly. |
| **Feature** | One row in `BACKLOG.md`. The atomic unit of work the orchestrator processes end-to-end. Each feature passes through phases A → E. |
| **Phase** | A named, discrete state in the orchestrator state machine: BOOTSTRAP, PHASE_A, PHASE_B, PHASE_C, PHASE_D, PHASE_E. Each phase has entry actions, delegation targets, and exit conditions. |
| **Active Feature** | The feature currently being processed by the orchestrator. Only one feature is active at a time. |
| **State Transition** | A rule-governed movement from one Phase to another, triggered by a Condition evaluated against on-disk state. |
| **Condition** | A boolean predicate evaluated against file state (e.g., "all tasks COMPLETED", "Score A ≥ threshold"). Conditions are evaluated, not guessed. |
| **Verdict** | The outcome of the Validation Gate in Phase C: one of PASS, RETRY, BLOCK, FAIL. Determines next phase and feature terminal status. |
| **Rework** | An iteration of Phase B triggered after a RETRY verdict. Each rework increments the `Reworks` counter on the feature. |
| **Threshold** | A numeric boundary in `BOOTSTRAP-CONFIG.json` that scores must meet or exceed for a PASS verdict (`scoreThresholdTL`, `scoreThresholdAdv`). |
| **IAgentRunner** | The outbound port interface the orchestrator uses to invoke any skill/agent. Decouples the state machine from LLM transport. Implemented in F003. |
| **Context Payload** | The minimal set of data assembled by the orchestrator and passed to `IAgentRunner.run(...)` for a specific phase invocation. Token-optimized. |
| **Product Files** | The four persistent files under `docs/product/` that encode all orchestrator state: `BACKLOG.md`, `DEVELOPMENT-STATE.md`, `DECISIONS.md`, `BOOTSTRAP-CONFIG.json`. |
| **Re-entry** | The ability of the orchestrator to restart after a crash or interruption by scanning the State Transition Table top-to-bottom and entering at the first matching condition. |
| **Spec Documents** | Files generated by the `scope-refinement` skill under `docs/specs/{domain}/`. The orchestrator verifies their presence but does not parse them (except Section 6 of `003-*-tactical-design.md`). |
| **Terminal Status** | A feature status from which the loop does not re-attempt: `COMPLETED`, `BLOCKED`, `FAILED`. |

---

## 4. Socratic Questions

1. **Re-entry determinism:** The re-entry rule states "scan top-to-bottom, enter at first matching condition." If two conditions in the State Transition Table simultaneously match after a crash (e.g., `TDD-OUTPUT.json` exists AND all tasks are already `COMPLETED`), which wins — and is the table ordering guaranteed to always produce the correct recovery behavior?

2. **Spec verification ownership:** Phase A3 says "wait for all `004-*-test-scenarios.md` files to exist." Who is responsible for detecting their presence — the orchestrator polling the filesystem, or a return value from `IAgentRunner`? If the agent runner resolves but the files are missing, is that a runner contract violation, a Phase A failure, or a retry trigger?

3. **Parallel validation atomicity:** Phase C dispatches two agents simultaneously. If one resolves and one fails (network error, timeout, parse failure), what is the expected system state? Does the orchestrator re-invoke only the failed agent, or restart Phase C entirely — and how is the half-completed validation state expressed in the product files?

4. **Section 6 parsing contract:** Phase A4 requires extracting ordered dev tasks from "Section 6" of `003-*-tactical-design.md`. This couples the state machine to a markdown document structure convention. What happens when the architect produces a tactical design without a Section 6, or with a differently named section? Is this a hard failure, a warning, or a fallback behavior?

5. **Threshold mutation mid-cycle:** `BOOTSTRAP-CONFIG.json` is loaded in Phase C1 "on entry or re-entry." If a human edits the thresholds between a RETRY and the subsequent Phase C re-entry, the new thresholds apply to the re-evaluation. Is this intentional (live config) or a bug (config should be frozen at BOOTSTRAP)?

6. **completedCycles semantics:** `completedCycles` is incremented for PASS, BLOCK, and FAIL verdicts — but not for RETRY. This means a feature that retries twice before passing contributes one cycle, while two features that each pass on first attempt contribute two cycles. Is this a meaningful metric, and does the SDK need to expose per-feature rework statistics separately?

7. **Memory persistence gate:** Phase E is mandatory after every Phase D, but Phase D transitions to Phase E, which then transitions back to Phase A. If Phase E (project-memory invocation) fails, the loop is broken between two features. Should Phase E failure be recoverable (retry), or should the orchestrator halt with an error, and how is this expressed in the state machine?
