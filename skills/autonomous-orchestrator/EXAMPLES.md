# Autonomous Orchestrator — Scenario Execution & File Evolution Examples

This document provides complete, step-by-step examples of how `docs/product/BACKLOG.md`, `docs/product/DEVELOPMENT-STATE.md`, and `docs/product/DECISIONS.md` evolve across different orchestration loop scenarios.

---

## Scenario 1: Initial Bootstrap State

Immediately after running **BOOTSTRAP**, the files are initialized with their base headers, and the backlog is generated from the initial PRD/scope. No features or tasks are in progress yet.

### `docs/product/BACKLOG.md`
```markdown
| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **F001** | **Database Connection pool** | `db_pool` | **CRITICAL** | None | 0 | - | - | `NOT_STARTED` |
| **F002** | **User Register API** | `user_reg` | **HIGH** | F001 | 0 | - | - | `NOT_STARTED` |
| **F003** | **Broken Core Feature** | `broken_core` | **MEDIUM** | F001 | 0 | - | - | `NOT_STARTED` |
| **F004** | **Minor Security Issue Feature** | `minor_sec` | **LOW** | F001 | 0 | - | - | `NOT_STARTED` |
```

### `docs/product/DEVELOPMENT-STATE.md`
*(Empty table, only headers initialized)*
```markdown
| Feature ID | Task ID | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- |
```

### `docs/product/DECISIONS.md`
*(Empty table, only headers initialized)*
```markdown
# Autonomous Decision Audit Trail

| Timestamp | Feature | Decision | Scores | Rationale |
| --- | --- | --- | --- | --- |
```

---

## Scenario 2: Success Path (Feature F001)

### Phase A (Planning)
When **F001** is selected, planning tasks are broken down and added to `DEVELOPMENT-STATE.md`.

#### `docs/product/BACKLOG.md`
```markdown
| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **F001** | **Database Connection pool** | `db_pool` | **CRITICAL** | None | 0 | - | - | `IN_PROGRESS` |
| **F002** | **User Register API** | `user_reg` | **HIGH** | F001 | 0 | - | - | `NOT_STARTED` |
| **F003** | **Broken Core Feature** | `broken_core` | **MEDIUM** | F001 | 0 | - | - | `NOT_STARTED` |
| **F004** | **Minor Security Issue Feature** | `minor_sec` | **LOW** | F001 | 0 | - | - | `NOT_STARTED` |
```

#### `docs/product/DEVELOPMENT-STATE.md`
```markdown
| Feature ID | Task ID | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- |
| F001 | T001 | Setup pg connection pool config | `db_pool` | - | `NOT_STARTED` |
| F001 | T002 | Implement healthcheck endpoint | `db_pool` | - | `NOT_STARTED` |
```

#### `docs/product/DECISIONS.md`
```markdown
| Timestamp | Feature | Decision | Scores | Rationale |
| --- | --- | --- | --- | --- |
| 2026-06-03 22:45 | F001 | IN_PROGRESS | - | Started planning and task breakdown |
```

### Phase B (Running & Completed Tasks)
Tasks are executed sequentially.

#### `docs/product/DEVELOPMENT-STATE.md`
```markdown
| Feature ID | Task ID | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- |
| F001 | T001 | Setup pg connection pool config | `db_pool` | - | `COMPLETED` |
| F001 | T002 | Implement healthcheck endpoint | `db_pool` | `IMPLEMENTATION` | `IN_PROGRESS` |
```

### Phase C (Validation Gate - PASS)
All tasks are completed. Validation scores are extracted. Both scores (TL: 0.85, Adv: 0.90) are above the thresholds.

#### `docs/product/BACKLOG.md`
```markdown
| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **F001** | **Database Connection pool** | `db_pool` | **CRITICAL** | None | 0 | 0.85 | 0.90 | `COMPLETED` |
| **F002** | **User Register API** | `user_reg` | **HIGH** | F001 | 0 | - | - | `NOT_STARTED` |
| **F003** | **Broken Core Feature** | `broken_core` | **MEDIUM** | F001 | 0 | - | - | `NOT_STARTED` |
| **F004** | **Minor Security Issue Feature** | `minor_sec` | **LOW** | F001 | 0 | - | - | `NOT_STARTED` |
```

#### `docs/product/DEVELOPMENT-STATE.md`
```markdown
| Feature ID | Task ID | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- |
| F001 | T001 | Setup pg connection pool config | `db_pool` | - | `COMPLETED` |
| F001 | T002 | Implement healthcheck endpoint | `db_pool` | - | `COMPLETED` |
```

#### `docs/product/DECISIONS.md`
```markdown
| Timestamp | Feature | Decision | Scores | Rationale |
| --- | --- | --- | --- | --- |
| 2026-06-03 22:45 | F001 | IN_PROGRESS | - | Started planning and task breakdown |
| 2026-06-03 22:50 | F001 | ACCEPTED | TL: 0.85, Adv: 0.90 | All tasks completed; scores above thresholds. |
```

---

## Scenario 3: Retry Path (Feature F002)

Feature **F002** fails validation on the first attempt (TL score: 0.50), triggering a retry.

### Validation failure (RETRY Gate)
The number of reworks increments in `BACKLOG.md`, tasks are reset to `NOT_STARTED` in `DEVELOPMENT-STATE.md`, and a retry decision is logged.

#### `docs/product/BACKLOG.md`
```markdown
| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **F001** | **Database Connection pool** | `db_pool` | **CRITICAL** | None | 0 | 0.85 | 0.90 | `COMPLETED` |
| **F002** | **User Register API** | `user_reg` | **HIGH** | F001 | 1 | - | - | `IN_PROGRESS` |
| **F003** | **Broken Core Feature** | `broken_core` | **MEDIUM** | F001 | 0 | - | - | `NOT_STARTED` |
| **F004** | **Minor Security Issue Feature** | `minor_sec` | **LOW** | F001 | 0 | - | - | `NOT_STARTED` |
```

#### `docs/product/DEVELOPMENT-STATE.md`
```markdown
| Feature ID | Task ID | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- |
| F001 | T001 | Setup pg connection pool config | `db_pool` | - | `COMPLETED` |
| F001 | T002 | Implement healthcheck endpoint | `db_pool` | - | `COMPLETED` |
| F002 | T001 | Create signup endpoint handler | `user_reg` | `IMPLEMENTATION` | `NOT_STARTED` |
| F002 | T002 | Implement password hashing | `user_reg` | `IMPLEMENTATION` | `NOT_STARTED` |
```

#### `docs/product/DECISIONS.md`
```markdown
| Timestamp | Feature | Decision | Scores | Rationale |
| --- | --- | --- | --- | --- |
| 2026-06-03 22:45 | F001 | IN_PROGRESS | - | Started planning and task breakdown |
| 2026-06-03 22:50 | F001 | ACCEPTED | TL: 0.85, Adv: 0.90 | All tasks completed; scores above thresholds. |
| 2026-06-03 22:55 | F002 | RETRY #1 | TL: 0.50, Adv: 0.85 | Grumpy Tech Lead flagged missing password validation schema. |
```

---

## Scenario 4: Blocked Path (Feature F003)

Feature **F003** fails validation repeatedly. After reaching the maximum reworks (`maxReworks = 2`), the failure causes an **application crash** (e.g. fatal database config syntax error), resulting in a `BLOCKED` status.

### Blocked feature (BLOCK Gate)
Status becomes `BLOCKED` for the feature in both backlog and development state.

#### `docs/product/BACKLOG.md`
```markdown
| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **F001** | **Database Connection pool** | `db_pool` | **CRITICAL** | None | 0 | 0.85 | 0.90 | `COMPLETED` |
| **F002** | **User Register API** | `user_reg` | **HIGH** | F001 | 1 | 0.80 | 0.80 | `COMPLETED` |
| **F003** | **Broken Core Feature** | `broken_core` | **MEDIUM** | F001 | 2 | 0.30 | 0.40 | `BLOCKED` |
| **F004** | **Minor Security Issue Feature** | `minor_sec` | **LOW** | F001 | 0 | - | - | `NOT_STARTED` |
```

#### `docs/product/DEVELOPMENT-STATE.md`
```markdown
| Feature ID | Task ID | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- |
| F001 | T001 | Setup pg connection pool config | `db_pool` | - | `COMPLETED` |
| F001 | T002 | Implement healthcheck endpoint | `db_pool` | - | `COMPLETED` |
| F002 | T001 | Create signup endpoint handler | `user_reg` | - | `COMPLETED` |
| F002 | T002 | Implement password hashing | `user_reg` | - | `COMPLETED` |
| F003 | T001 | Setup memory intensive component | `broken_core` | - | `BLOCKED` |
```

#### `docs/product/DECISIONS.md`
```markdown
| Timestamp | Feature | Decision | Scores | Rationale |
| --- | --- | --- | --- | --- |
...
| 2026-06-03 23:10 | F003 | BLOCKED | TL: 0.30, Adv: 0.40 | BLOCKED after 2 attempts. Rationale: Out-of-memory crash occurred during execution. |
```

---

## Scenario 5: Failed Path (Feature F004)

Feature **F004** fails validation repeatedly. After reaching the maximum reworks (`maxReworks = 2`), the failure does **NOT** cause an application crash (e.g. minor edge-case bug or non-breaking security warning). The status is marked as `FAILED` to register the issue, but development is allowed to continue.

### Failed feature (FAIL Gate)
Status becomes `FAILED` for the feature in both backlog and development state. The loop proceeds to any remaining features.

#### `docs/product/BACKLOG.md`
```markdown
| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **F001** | **Database Connection pool** | `db_pool` | **CRITICAL** | None | 0 | 0.85 | 0.90 | `COMPLETED` |
| **F002** | **User Register API** | `user_reg` | **HIGH** | F001 | 1 | 0.80 | 0.80 | `COMPLETED` |
| **F003** | **Broken Core Feature** | `broken_core` | **MEDIUM** | F001 | 2 | 0.30 | 0.40 | `BLOCKED` |
| **F004** | **Minor Security Issue Feature** | `minor_sec` | **LOW** | F001 | 2 | 0.65 | 0.60 | `FAILED` |
```

#### `docs/product/DEVELOPMENT-STATE.md`
```markdown
| Feature ID | Task ID | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- |
| F001 | T001 | Setup pg connection pool config | `db_pool` | - | `COMPLETED` |
| F001 | T002 | Implement healthcheck endpoint | `db_pool` | - | `COMPLETED` |
| F002 | T001 | Create signup endpoint handler | `user_reg` | - | `COMPLETED` |
| F002 | T002 | Implement password hashing | `user_reg` | - | `COMPLETED` |
| F003 | T001 | Setup memory intensive component | `broken_core` | - | `BLOCKED` |
| F004 | T001 | Implement CSRF protection | `minor_sec` | - | `FAILED` |
```

#### `docs/product/DECISIONS.md`
```markdown
| Timestamp | Feature | Decision | Scores | Rationale |
| --- | --- | --- | --- | --- |
...
| 2026-06-03 23:25 | F004 | FAILED | TL: 0.65, Adv: 0.60 | FAILED after 2 attempts. Rationale: Missing secondary TLS verification headers, non-crashing security issue. Continuing development. |
```
