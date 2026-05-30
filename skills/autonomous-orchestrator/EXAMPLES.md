# Autonomous Orchestrator — File Templates & Examples

These are the reference templates for files managed by the autonomous-orchestrator.
The orchestrator creates these files during BOOTSTRAP and updates them throughout the loop.

---

## docs/product/BACKLOG.md

```
| ID | Title | Domain | Priority | Dependencies | Status |
| --- | --- | --- | --- | --- | --- |
| **F001** | **ProductCatalog Microservice** | `product_catalog` | **CRITICAL** | None | `COMPLETED` |
| **F002** | **UserAuth Service** | `user_auth` | **HIGH** | F001 | `IN_PROGRESS` |
| **F003** | **OrderManagement Service** | `order_management` | **MEDIUM** | F001, F002 | `NOT_STARTED` |
```

---

## docs/product/DEVELOPMENT-STATE.md

Re-entry example after crash during TDD phase (F002/T001 in progress, F002/T002 not started yet):

> **Phase C Rule:** The orchestrator only enters Phase C (VALIDATION) for a feature when **ALL tasks** of that `Feature ID` have `Status = COMPLETED` from Phase B. Individual tasks are implemented sequentially within Phase B; validation runs once at the end for the whole feature.

```
| Feature ID | Task ID | Description | Domain | Current Phase | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F001 | T001 | Setup database connection pool | `product_catalog` | - | 0 | 0.85 | 0.90 | `COMPLETED` |
| F001 | T002 | Implement CRUD operations for products | `product_catalog` | - | 0 | 0.88 | 0.92 | `COMPLETED` |
| F002 | T001 | Implement JWT token generation | `user_auth` | `IMPLEMENTATION` | 1 | - | - | `IN_PROGRESS` |
| F002 | T002 | Add middleware for authentication | `user_auth` | - | 0 | - | - | `NOT_STARTED` |
| F003 | T001 | Setup order state machine | `order_management` | - | 0 | - | - | `NOT_STARTED` |
```

Example of F002 **ready for Phase C** (all tasks completed, before validation runs):

```
| Feature ID | Task ID | Description | Domain | Current Phase | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F002 | T001 | Implement JWT token generation | `user_auth` | `VALIDATION` | 1 | - | - | `IN_PROGRESS` |
| F002 | T002 | Add middleware for authentication | `user_auth` | `VALIDATION` | 0 | - | - | `IN_PROGRESS` |
```

> Both tasks show `VALIDATION` simultaneously — Phase C runs once for the entire feature, not per task.

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
