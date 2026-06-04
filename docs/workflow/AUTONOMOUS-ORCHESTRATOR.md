# 🤖 Autonomous Orchestrator Workflow

This document describes the workflow for using the **Autonomous Orchestrator** skill (`skills/autonomous-orchestrator/SKILL.md`). It acts as a sovereign loop manager to coordinate the entire lifecycle of software features—from planning and TDD-driven development to validation and continuous optimization.

---

## 🏗️ The 4-Layer Architecture

The autonomous development cycle operates on a robust **4-layer architectural model**:

| Layer | Component | Description | Managed Artifacts |
| :--- | :--- | :--- | :--- |
| **Layer 1** | **Product State Machine** | Stores development state, prioritization, and completion criteria. | `BACKLOG.md`, `DEVELOPMENT-STATE.md`, `COMPLETION-CRITERIA.json`, `DECISIONS.md` |
| **Layer 2** | **Autonomous Orchestrator** | Coordinates the main execution loop and enforces the decision gate. | `autonomous-orchestrator` / `BOOTSTRAP-CONFIG.json` |
| **Layer 3** | **Contextual Expert Skills** | Specialized skills delegated strictly to isolated agent personas. | `scope-refinement`, `tdd-orchestrator`, `the-grumpy-tech-lead`, `adversarial-qa` |
| **Layer 4** | **Filesystem Database $\mathcal{D}$** | Long-term memory, specifications, and execution history files. | `docs/README.md`, `docs/adr/`, `docs/specs/`, `docs/harness-history/` |

---

## 🔄 The Autonomous Execution Loop

```mermaid
graph TD
    A[BOOTSTRAP: Scope & Paths] --> B(Phase A: Planning <br/> scope-refinement via software-architect)
    B --> C(Phase B: Implementation <br/> tdd-orchestrator via developer-*)
    C --> D(Phase C: Parallel Validation <br/> the-grumpy-tech-lead & adversarial-qa)
    D --> E{Decision Gate Verdict}
    E -- PASS --> F(Phase D: State & Completion Check)
    E -- "RETRY (Reworks < maxReworks)" --> C
    E -- "BLOCKED (crash/critical break)" --> F
    E -- "FAILED (non-blocking, continuable)" --> F
    F --> G(Phase E: Memory Persistence)
    G --> H{Executable Features Remain?}
    H -- Yes --> B
    H -- No --> I[HALT]
```

Autonomous Development Cycle:
![Autonomous Development Cycle](../assets/running.png)

---

## 🚀 Execution Phases in Detail

Once started, the orchestrator adheres to a **CRITICAL EXECUTION MANDATE**: once initial scope is provided, **never stop or ask questions**. It executes all phases atomically.

### 1. BOOTSTRAP (State Initialization)

Before starting, the orchestrator performs workspace verification:

* **Scope Acquisition**: If `BACKLOG.md` is missing, it **asks once** for the project scope/PRD, then never again.
* **Project Paths**: Collects the absolute local directories involved (`${projectPaths}`).
* **Score Thresholds**: Loaded **automatically** from `docs/product/BOOTSTRAP-CONFIG.json`:
  * **Grumpy Tech Lead Score** (`${scoreThresholdTL}`, default: `0.70`)
  * **Adversarial QA Score** (`${scoreThresholdAdv}`, default: `0.70`)
  * **Max Reworks** (`${maxReworks}`): loaded from `docs/product/COMPLETION-CRITERIA.json`

  > Thresholds are **never asked interactively**. They are read from config files on every Phase C entry or re-entry.

* **File Initialization**: For each required product file in `docs/product/`, if it does not already exist, copies it from the template model in `skills/autonomous-orchestrator/models/`.
* **Synthesis**: Synthesizes the initial `docs/product/BACKLOG.md` table and initializes `docs/product/DEVELOPMENT-STATE.md`, `COMPLETION-CRITERIA.json`, `DECISIONS.json`, and the Cycle Counter.

### 2. THE RUNTIME CYCLE

#### 📋 Phase A: Delegation of Planning
* **State Change:** Logs `IN_PROGRESS` in `BACKLOG.md` and records to `DECISIONS.md`.
* **Delegation:** Invokes `scope-refinement` strictly mapped to the **`software-architect`** agent.
* **Verification:** Waits until all domain specs and test scenario documents (`004-*-test-scenarios.md`) are successfully generated under `docs/specs/{domain}/`.

#### 💻 Phase B: Delegation of Implementation
* **State Change:** Logs `IMPLEMENTATION / IN_PROGRESS` in `DEVELOPMENT-STATE.md`.
* **Delegation:** Invokes `tdd-orchestrator` strictly mapped to the **`developer-backend`**, **`developer-frontend`**, or **`developer-debugging`** agents.
* **Rework Injection:** If this is a RETRY, automatically injects the compiled `REWORK-LOG.md` containing preceding validation issues.
* **Verification:** Waits until `docs/specs/{domain}/TDD-OUTPUT.json` is generated.

#### 🛡️ Phase C: Validation & Decision Gate

> **GATE:** Phase C only begins when **ALL tasks** for the feature in `DEVELOPMENT-STATE.md` have `Status = COMPLETED`.

* **Threshold Loading (on every entry):** Reads `${scoreThresholdTL}`, `${scoreThresholdAdv}` from `BOOTSTRAP-CONFIG.json` and `${maxReworks}` from `COMPLETION-CRITERIA.json`.
* **State Change:** Logs `VALIDATION` phase in `DEVELOPMENT-STATE.md`.
* **Parallel Dispatch:** Dispatches both validation sensors simultaneously:
  1. **Critique:** Invokes `the-grumpy-tech-lead` via the **`harness-tech-lead`** agent.
  2. **Attack:** Invokes `adversarial-qa` via the **`harness-qa`** agent.
* **JSON Extraction Protocol:** Parses validation outputs defensively by searching code fences or extracting text between `{` and `}`.
* **Decision Gate Verdict:**

| Verdict | Condition | Action |
|:---|:---|:---|
| **`PASS`** | Both scores ≥ thresholds | Sets backlog status `COMPLETED`; logs decision; increments cycle counter; → Phase D |
| **`RETRY`** | Any score < threshold AND `Reworks < ${maxReworks}` | Increments `Reworks`; writes findings to `REWORK-LOG.md`; → Phase B |
| **`BLOCKED`** | Any score < threshold AND `Reworks ≥ ${maxReworks}` AND failure causes crash/critical break | Sets status `BLOCKED`; logs decision; increments cycle counter; → Phase D |
| **`FAILED`** | Any score < threshold AND `Reworks ≥ ${maxReworks}` AND failure is non-blocking (development can continue) | Sets status `FAILED`; logs decision; increments cycle counter; → Phase D |

> **`FAILED` vs `BLOCKED`:** `FAILED` means the feature has a non-blocking issue (e.g., a minor bug or security vulnerability that does not crash the application). Development continues. `BLOCKED` means the feature failure causes an application crash or breaks core functionality—it must be resolved before proceeding.

Below is a visual example of how this Socratic code review occurs during autonomous validation:

![Socratic Code Review Example](../assets/code-review.png)

> ### 🎯 Understanding Dynamic Quality Thresholds
>
> The `${scoreThresholdTL}` and `${scoreThresholdAdv}` values (default `0.70`) are loaded from `docs/product/BOOTSTRAP-CONFIG.json` on each Phase C entry. This means thresholds can be updated per-project without modifying the skill itself.
>
> * **Why is this threshold so important?**
>   1. **Goes Beyond Simple Tests:** Unit tests verify the code *works*. The `0.70` gate checks if it is *production-ready*—auditing for N+1 queries, memory leaks, race conditions, and security exposures.
>   2. **Automates Uncompromising Standards:** A feature scoring `0.65` is automatically retried or failed. The orchestrator writes the critique to `REWORK-LOG.md` and cycles back—no human intervention needed.
>   3. **Balancing Rigor and Progress:** The `0.70` bar ensures high-quality software while preventing the agent from getting stuck on harmless style details.

#### 📈 Phase D: State & Completion Check
* **Completion check:** Verifies all features in `BACKLOG.md` are `COMPLETED`, `BLOCKED`, or `FAILED`.
* **Loop decision:** If executable features remain → Phase E → Phase A (next feature). Otherwise → Phase E → HALT.

#### 💾 Phase E: Memory Persistence
* **Trigger:** After every Phase D (both mid-loop and final HALT).
* **Action:** Invokes `project-memory` skill to update documentation with the cycle summary (feature IDs processed, final scores, key decisions, current cycle count).

---

## 🛡️ Strict Conduct Rules for the Orchestrator

To ensure clean execution, the orchestrator strictly enforces these boundaries:

1. **No Developer Emulation:** The orchestrator coordinates, manages state, and delegates. It never writes source code, edits tests, or modifies implementation files directly.
2. **Subagent Context Isolation:** Technical skills must only run inside their designated agent personas (e.g. `scope-refinement` inside `software-architect`).
3. **Persistence First:** State updates, rework increments, and backlog status changes are saved to disk *before* triggering the next subagent command.
4. **Defensive Parsing:** Employs strict JSON extraction to handle raw LLM responses.

---

## 💡 Best Practice Recommendations

### 📋 1. Initialize Documentation with `project-memory`
> **Use the `project-memory` skill** to establish your baseline project documentation in ADR (Architectural Decision Record) and Feature specification format before initiating development. Starting with a clear documentation memory prevents architectural drift and ensures the Autonomous Orchestrator works with high-fidelity, standardized rules.
>
> A meticulously prepared **Checklist: Before Starting a Project** (defined in the [Daily Use Playbook](PLAYBOOK-DAILY-USE.md)) is crucial because the orchestrator will not stop to ask questions or resolve missing specifications.

### 🧠 2. Establish High-Fidelity Context with Brainstorming
> For the Autonomous Orchestrator to work effectively, it requires a highly defined context of what to develop.
> - If your project scope, constraints, or technical strategies are underspecified, **conduct an interactive exploration of the problem space first**.
> - Ensure your context is fully structured and solid before kicking off the autonomous execution loop.
