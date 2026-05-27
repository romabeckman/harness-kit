# 🤖 Autonomous Orchestrator Workflow

This document describes the workflow for using the **Autonomous Orchestrator** skill (`skills/autonomous-orchestrator/SKILL.md`), which operates as a sovereign loop manager to coordinate the entire lifecycle of software features—from planning and TDD-driven development to validation and continuous optimization.

---

## 🚀 How to Use the Skill

The Autonomous Orchestrator coordinates development in a fully automated loop. Once the scope is initially established, it operates atomically without pausing for user confirmation or interactive prompts.

### 1. Bootstrap (Initialization)
Before executing the loop, ensure the workspace is ready:
- **Scope & Backlog:** Define the project scope. If missing, the orchestrator will ask for it once.
- **Project Paths:** Specify the local directory paths for the projects involved.
- **Score Thresholds:** Set target validation thresholds for the quality gates:
  - **Tech Lead Score** (Default: `0.70`)
  - **Adversarial QA Score** (Default: `0.70`)
- **Synthesis:** The orchestrator will automatically generate:
  - `docs/product/BACKLOG.md` (Features and Snake-Case Domains)
  - `docs/product/DEVELOPMENT-STATE.md` (Execution tracking)
  - `docs/product/COMPLETION-CRITERIA.md`
  - `docs/product/DECISIONS.md` (Audit trail of gates)
  - `docs/product/BOOTSTRAP-CONFIG.md` (Persisted configurations)
- **Cycle Initialization:** Sets a cycle counter to track progress and trigger auto-tuning intervals.

### 2. The Orchestration Loop
The orchestrator autonomously processes each feature in `BACKLOG.md` through the following phases:
1. **Phase A (Planning):** Invokes `harness-kit:scope-refinement` to generate design specs and test scenarios under `docs/specs/{domain}/`.
2. **Phase B (Implementation):** Invokes `harness-kit:tdd-orchestrator` to run a continuous TDD execution cycle on the codebase. If this is a rework cycle, findings are passed via `REWORK-LOG.md`.
3. **Phase C (Validation & Decision Gate):** Evaluates implementation quality using a defensive JSON extraction protocol to parse scores from:
   - `harness-kit:the-grumpy-tech-lead`
   - `harness-kit:adversarial-qa`
   - **Verdict:** Features that meet score thresholds are marked `COMPLETED` and proceed. Features below the threshold are routed back to Phase B (Rework) up to twice before being marked `BLOCKED`.
4. **Phase D (Trace, Evolution & Auto-Tuning):** 
   - **Trace:** Records performance via `harness-kit:harness-tracer`.
   - **Auto-Tuning Gate:** Every 10 completed cycles, or when the backlog is completely exhausted, the orchestrator triggers the optimization tools (`harness-kit:harness-evaluator` and `harness-kit:meta-harness`) to fine-tune the skill configurations dynamically.
   - **Completion Check:** Validates that all features are completed/blocked and that all completion criteria are met before officially halting.

### 3. Strict Rules of Conduct
The orchestrator adheres strictly to these principles:
- **No Developer Emulation:** The orchestrator *only* manages the state and delegates. It never touches code, tests, or performs technical implementations directly.
- **Subagent Context Isolation:** Specialized skills (scope-refinement, TDD, QA) are strictly invoked as isolated subagents.
- **Persistence First:** Every decision and state transition is physically logged in the Markdown files (like `DEVELOPMENT-STATE.md` and `DECISIONS.md`) *before* executing the sub-agent command.

---

## 💡 Best Practice Recommendations

### 📋 1. Initialize Documentation with `project-memory`
> [!TIP]
> **Use the `project-memory` skill** to establish your project documentation in ADR (Architectural Decision Record) and Feature specification format before initiating development. Starting with a clear documentation memory prevents architectural drift and ensures the Autonomous Orchestrator works with high-fidelity, standardized rules.

### 🧠 2. Establish High-Fidelity Context with Brainstorming
> [!IMPORTANT]
> For the Autonomous Orchestrator to work effectively, it requires a highly defined context of what to develop. 
> - If your project scope, constraints, or technical strategies are underspecified, **use the `superpowers brainstorming` skill** to conduct an interactive exploration of the problem space first.
> - Ensure your context is fully structured and solid before kicking off the autonomous execution loop.
