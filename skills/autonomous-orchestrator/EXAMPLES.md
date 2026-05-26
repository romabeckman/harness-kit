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

Re-entry example after crash during TDD phase:

```
| Feature ID | Domain | Current Phase | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F001 | `product_catalog` | - | 0 | 0.85 | 0.90 | `COMPLETED` |
| F002 | `user_auth` | `IMPLEMENTATION` | 1 | - | - | `IN_PROGRESS` |
| F003 | `order_management` | - | 0 | - | - | `NOT_STARTED` |
```

---

## docs/product/COMPLETION-CRITERIA.md

```
## Completion Requirements (Dynamically Configured):

All features in BACKLOG.md must be marked as `COMPLETED`.

For a feature to be `COMPLETED`, the following must be true:

* `the-grumpy-tech-lead` score >= ${scoreThresholdTL} (configured during BOOTSTRAP)
* `adversarial-qa` score >= ${scoreThresholdAdv} (configured during BOOTSTRAP)
* No critical vulnerabilities reported

For a feature to be `BLOCKED`, the following must be true:

* `reworks >= 2`
```

---

## docs/product/BOOTSTRAP-CONFIG.md

```
# Bootstrap Configuration (Persisted for Re-entry)

## Score Thresholds

| Skill | Threshold | User Provided |
| --- | --- | --- |
| `the-grumpy-tech-lead` | 0.70 | No (using default) |
| `adversarial-qa` | 0.70 | No (using default) |

## Cycle Counter

- **completedCycles:** 0
- **lastAutoTuningAt:** — (never)

> Note: The cycle counter tracks terminal states (COMPLETED or BLOCKED). Every 10 cycles, auto-tuning triggers harness-evaluator + meta-harness. The counter persists across re-entries.
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
