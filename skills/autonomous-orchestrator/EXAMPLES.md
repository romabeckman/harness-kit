# Autonomous Orchestrator — File Templates & Examples

These are the reference templates for files managed by the autonomous-orchestrator.
The orchestrator creates these files during BOOTSTRAP and updates them throughout the loop.

---

## docs/product/BACKLOG.md

```
| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **F001** | **ProductCatalog Microservice** | `product_catalog` | **CRITICAL** | None | 0 | 0.85 | 0.90 | `COMPLETED` |
| **F002** | **UserAuth Service** | `user_auth` | **HIGH** | F001 | 1 | - | - | `IN_PROGRESS` |
| **F003** | **OrderManagement Service** | `order_management` | **MEDIUM** | F001, F002 | 0 | - | - | `NOT_STARTED` |
```

---

## docs/product/DEVELOPMENT-STATE.md

> **Purpose:** Task-level tracking only. Columns: `Feature ID`, `Task ID`, `Description`, `Domain`, `Current Phase`, `Status`.  
> `Reworks`, `Score (TL)`, and `Score (Adv)` are **feature-level** and live in `BACKLOG.md`.

> **Phase C Rule:** Phase C (VALIDATION) only starts when **ALL tasks** for the same `Feature ID` have `Status = COMPLETED`. Validation runs once per feature, not per task.

Re-entry example — F002/T001 in progress, F002/T002 not started yet:

```
| Feature ID | Task ID | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- |
| F001 | T001 | Setup database connection pool | `product_catalog` | - | `COMPLETED` |
| F001 | T002 | Implement CRUD operations for products | `product_catalog` | - | `COMPLETED` |
| F002 | T001 | Implement JWT token generation | `user_auth` | `IMPLEMENTATION` | `IN_PROGRESS` |
| F002 | T002 | Add middleware for authentication | `user_auth` | - | `NOT_STARTED` |
| F003 | T001 | Setup order state machine | `order_management` | - | `NOT_STARTED` |
```

Example of F002 **ready for Phase C** — all tasks completed, validation about to run:

```
| Feature ID | Task ID | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- |
| F002 | T001 | Implement JWT token generation | `user_auth` | `VALIDATION` | `IN_PROGRESS` |
| F002 | T002 | Add middleware for authentication | `user_auth` | `VALIDATION` | `IN_PROGRESS` |
```

> Both tasks enter `VALIDATION` simultaneously. After Phase C PASS, both become `COMPLETED` and scores are written to `BACKLOG.md`.

---

## docs/product/COMPLETION-CRITERIA.json

```json
{
  "completionRequirements": {
    "allFeaturesCompleted": true,
    "minScoreGrumpyTechLead": "${scoreThresholdTL}",
    "minScoreAdversarialQA": "${scoreThresholdAdv}",
    "noCriticalVulnerabilities": true
  },
  "blockedCriteria": {
    "maxReworks": 2
  }
}
```

---

## docs/product/BOOTSTRAP-CONFIG.json

```json
{
  "scoreThresholds": {
    "theGrumpyTechLead": {
      "threshold": 0.70,
      "userProvided": false
    },
    "adversarialQA": {
      "threshold": 0.70,
      "userProvided": false
    }
  },
  "cycleCounter": {
    "completedCycles": 0,
    "lastAutoTuningAt": null
  }
}
```

---

## docs/product/DECISIONS.md

```
# Autonomous Decision Audit Trail

| Timestamp | Feature | Decision | Scores | Rationale |
| --- | --- | --- | --- | --- |
| 2026-05-25 10:15 | F001 | ACCEPTED | TL: 0.85, Adv: 0.90 | Both scores above threshold |
| 2026-05-25 12:30 | F002 | RETRY #1 | TL: 0.56, Adv: 0.85 | Tech lead flagged N+1 query in user search |
| 2026-05-25 18:00 | — | AUTO-TUNING | cycle: 10 | Triggered harness-evaluator + meta-harness. Candidate v001 PROMOTED for tdd-orchestrator |
```
