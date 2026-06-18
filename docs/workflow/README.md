# 📖 HarnessKit: Workflow Documentation

Complete entry guide for using HarnessKit in a structured, data-driven sequence. This folder contains the essential blueprints to understand, plan, and execute your harness-based development workflow.

---

## 🚀 Quick Navigation

Choose your entry point based on what you need right now:

### **📚 Conceptual & Architectural Foundation**
→ **[META-HARNESS.md](META-HARNESS.md)**
- Complete architectural mapping based on the *"Meta-Harness"* paper.
- Explanation of the 3-Layer structure: Developer → Skills → Filesystem $\mathcal{D}$.
- The continuous optimization algorithm, mathematical loop formulation, and the Pareto frontier.
- Comprehensive 8-day practical execution history and simulation.

### **🎯 Hands-On Operational Playbook**
→ **[PLAYBOOK-DAILY-USE.md](PLAYBOOK-DAILY-USE.md)**
- Actionable checklists and step-by-step instructions for daily engineering routines.
- Concrete terminal execution flows: introducing new features, managing bug fixes, and harness optimization loops.
- Real-world timeline tracking examples, specific command syntaxes, expected outputs, and troubleshooting recipes.
- Agent routing rules for `harness-tracer`, `harness-evaluator`, and `meta-harness`.

### **🤖 Autonomous Loop Orchestration**
→ **[AUTONOMOUS-ORCHESTRATOR.md](AUTONOMOUS-ORCHESTRATOR.md)**
- Step-by-step workflow for running the sovereign, fully automated execution loop.
- Full status lifecycle: `PASS`, `RETRY`, `BLOCKED`, and `FAILED`.
- Best practices on initializing project documentation and defining proper brainstorming contexts.

---

## 🗂️ The Core Documentation Architecture

The workspace documentation is organized into three primary pillars to cover theoretical foundations, manual operations, and automated orchestration:

| Document | Nature | Primary Objective | Key Target Focus |
|:---|:---|:---|:---|
| **META-HARNESS.md** | Conceptual & Analytical | Explains *why* and *how* the system evolves natively. | Core Architecture, Optimization Loop, Ecosystem State. |
| **PLAYBOOK-DAILY-USE.md** | Practical & Operational | Provides immediate tactical guidance for day-to-day engineering. | Terminal Commands, Checklists, Agent Routing, Metrics Tracking. |
| **AUTONOMOUS-ORCHESTRATOR.md** | Automated Workflow | Guides the sovereign orchestration cycle and prerequisite setup. | Orchestration Loop, Status Machine (PASS/RETRY/BLOCKED/FAILED), Dynamic Thresholds. |

---

## 📞 Quick Reference Guide

| If you are asking... | Find the answer in... | Section / Anchor |
|:---|:---|:---|
| *"Where do I start my daily task?"* | `PLAYBOOK-DAILY-USE.md` | Checklist: Before Starting |
| *"What does each skill do internally?"* | `META-HARNESS.md` | Layer 2: Skills |
| *"Which skill should I invoke next?"* | `PLAYBOOK-DAILY-USE.md` | Flow 1 & Flow 2 |
| *"How does the meta-harness improve code?"* | `META-HARNESS.md` | The Continuous Optimization Loop |
| *"How do I run the sovereign automated loop?"* | `AUTONOMOUS-ORCHESTRATOR.md` | 🚀 Execution Phases in Detail |
| *"What are the recommendations for project documentation?"* | `AUTONOMOUS-ORCHESTRATOR.md` | 💡 Best Practice Recommendations |
| *"What is the difference between FAILED and BLOCKED?"* | `AUTONOMOUS-ORCHESTRATOR.md` | Phase C: Decision Gate Verdict |
| *"Where are score thresholds configured?"* | `AUTONOMOUS-ORCHESTRATOR.md` | Phase C: Dynamic Quality Thresholds |
| *"When does harness-evaluator run automatically?"* | `PLAYBOOK-DAILY-USE.md` | Flow 2: Optimize Harness |
| *"An execution error occurred, how do I solve it?"* | `PLAYBOOK-DAILY-USE.md` | Troubleshooting |

---

## ✅ System Readiness Checklist

Your HarnessKit environment is fully operational when:
- [ ] The core workspace contains `docs/README.md`, `docs/adr/ARCHITECTURE.md`, and `docs/adr/TESTS.md`.
- [ ] You understand the **agent routing rules**: `harness-tracer` (default), `harness-evaluator` (multiples of 5 traces), `meta-harness` (explicit request only).
- [ ] You know that score thresholds (`scoreThresholdTL`, `scoreThresholdAdv`) and `maxReworks` are loaded from `docs/product/BOOTSTRAP-CONFIG.json` — never asked interactively.
- [ ] You understand the four terminal statuses: `COMPLETED` (pass), `RETRY` (in-progress rework), `FAILED` (non-blocking issue, dev continues), `BLOCKED` (crash/critical break, must be resolved).
- [ ] You understand the lifecycle pipeline: **Develop → Trace → Evaluate (every 5 traces) → Optimize (explicit)**.