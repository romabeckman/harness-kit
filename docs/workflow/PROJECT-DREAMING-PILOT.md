# Project Dreaming pilot for SDK diagnosis

The pilot evaluates `diagnose-recovery-after-restart` revision 1 for `feature:sdk_diagnose`. The source project is `sdk/`. The hypothesis and experimental edits were staged in disposable project roots. The owning project's live feature remains the authority for RED guidance.

## Evidence and frozen prediction

The origin at `30a45a29bd4ae0dd1d29d3756e68b1874d48cbb6` consists of two service tests. One case gives new captures separate session IDs. A second passes an already reserved `traceId` to one service execution and checks reuse. The existing checks motivate testing persisted retry across instances. The diagnosis, trace adapter, and TDD-output reader suites passed on the source snapshot, with 39 tests. [DiagnoseService tests](../../sdk/src/diagnose/__tests__/DiagnoseService.test.ts#L222)

The frozen revision advised exercising an applicable retry with a new service and ledger instance, using persisted state and checking that the reserved trace ID survives without duplication. It excluded fresh captures, instance-local retry, and tasks with equivalent coverage. Its prediction required a distinct task where the variant detected loss of identity before review and the baseline missed it. Detection by both arms or misuse at the boundary refutes the prediction. The evaluator confirmed the freeze digest `258ca67d090a2753c074f1aa17bb8a783bcef4f338b515123b0da9227e035d12` before running checks.

The evaluator separately exercised recovery using a fresh service and JSONL ledger in a disposable copy. The intact implementation recovered the same trace ID and retained one logical ledger record. The check detected a simulated loss of persisted trace IDs, while the existing service suite still passed against that mutation. The three Vitest invocations took about three seconds of execution wall time.

## Paired run 1

`dreaming-paired.1cGiCW` used separate autonomous TDD sessions and the same three tasks per arm. The variant received the frozen orientation in the feature. The independent evaluator graded the two first submissions with identical checks. During the isolation audit, the evaluator found that a reference available to both arms contained a diagnosis example equivalent to the candidate. These results exercise the workflow and have compromised comparability. The shared example was replaced with an unrelated domain before repeating the evaluation.

| Measure | Baseline | Variant |
| --- | ---: | ---: |
| Cases | 3 | 3 |
| First deliveries approved, including the RED gate | 2 | 2 |
| Clean behavior checks passed | 3 | 3 |
| Known failures caught before review | 0 | 0 |
| Simulated persistence failures caught during independent replay | 1 | 1 |
| Boundary misapplications | 0 | 0 |

Both recovery tests were green on first execution. Both caught the same simulated persistence fault after submission. The variant recorded `applied` for recovery and `skipped` for fresh capture and instance-local retry, reusing the existing tests for both exceptions. The two boundary checks passed in both arms. This attempt did not cover reuse of an equivalent persisted-recovery test or source drift. The evaluator ran eight Vitest invocations with 3.26 seconds of reported test time. End-to-end agent cost, Dreaming cost, and cost per first-pass approval are unknown.

The attempt is inconclusive. The example made the candidate's action available to the baseline, the measured result tied, and the known fault was introduced after submission. The frozen prediction requires a gain before review.

## Clean interactive run

`dreaming-clean.DnYTtC` used two fresh interactive TDD sessions with the same three synthetic diagnosis tasks, starting state, criteria, and inherited agent settings. The evaluator checked that the candidate appeared only in the variant feature. The exact model and effort were unavailable.

| Measure | Baseline | Variant |
| --- | ---: | ---: |
| Cases | 3 | 3 |
| Verified first-pass approvals | 3 | 3 |
| Seeded failures caught in RED | 1 | 1 |
| Equivalent persisted-recovery tests reused | 1 | 1 |
| Boundary misapplications | 0 | 0 |

Both arms detected the seeded loss of persisted identity in RED and fixed it. Independent replay confirmed that both submitted tests failed on the seeded fault and passed after the fix. In the coverage control, both arms reused the existing persisted-recovery test. The variant recorded `covered`. In the drift control, both used the updated contract test. The variant recorded `skipped` and cited the missing source locator. Fresh capture was exercised in the autonomous workflow run above.

The evaluator independently reran selected tests in eight Vitest invocations. Their reported suite durations totaled 3.519 seconds. Agent execution cost, Dreaming cost, and total cost per approval were unavailable.

**Decision.** Archive revision 1 as `refuted`. The baseline caught the same in-scope failure in the clean paired task, meeting the frozen refutation condition. The result applies to the injected fault in this synthetic task.

## Workflow checks

| Acceptance criterion | Evidence |
| --- | --- |
| CA-01 · Normal entry | The guidance parser treats a missing section and fenced examples as empty. The paired exercise uses the normal TDD instructions. |
| CA-02 · Extraction | The source tests produced one candidate with localizable origin and a stable feature-qualified ID. Both attempts and the archived result reused the ID. |
| CA-03 · Traceability | The candidate was frozen before the independent evaluation. Both attempts and their decisions are linked by revision and digest. |
| CA-04 · Publication | A synthetic handoff resolved through a copy of the real diagnosis feature route and wrote one entry. A repeated handoff returned `already_current`. |
| CA-05 · Use and exception | The workflow run exercised fresh capture and instance-local retry. The clean run verified equivalent persisted coverage and scope under contract drift. |
| CA-06 · Cleanup | The pilot archived the refuted revision with its evaluations in the disposable learning store. Repeating reconciliation left the archived file byte-identical. A separate abandoned-draft fixture was removed after checking evidence, evaluations, inbound references, and backlog. The helper withdrew the fixture entry through the same route and a repeated withdrawal returned `already_current`. |
| CA-07 · Recovery | A test interrupts the atomic replacement and verifies the original document remains readable. Retrying the same handoff publishes once. A stale revision conflicts. |
| CA-08 · Compatibility | The pilot exercised both TDD modes. Existing trace adapter and TDD-output reader tests pass. An additional check in a disposable snapshot verified that the SDK reader preserves `orientation_use` when present. The trace extension uses the existing `steps.md` file. |

Run the publication checks with `python3 -m pytest -q skills/project-dreaming/scripts skills/project-memory/scripts`. For direct and autonomous invocation instructions, see the [daily playbook](PLAYBOOK-DAILY-USE.md#review-a-development-episode-between-tasks). For the held-out procedure and result fields, see the [paired evaluation contract](../../skills/project-dreaming/references/PAIRED-EVALUATION.md).
