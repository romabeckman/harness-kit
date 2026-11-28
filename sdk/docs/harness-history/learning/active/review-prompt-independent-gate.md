---
schema_version: 1
id: review-prompt-independent-gate
revision: 1
status: candidate
feature_node_id: "feature:sdk_core"
phase: before-red
applies_when: "A change affects reviewer prompt inputs or the internal completion gate for TDD output."
proposed_action: "Exercise an incomplete report with approving reviewer responses and inspect both prompts as well as the resulting gate decision."
skip_when: "The change cannot affect both boundaries, or equivalent coverage already checks the same prompt and decision."
prediction: "The combined test detects leakage of a prior completion verdict or report reference into reviewer prompts while also checking that incomplete work cannot pass the internal gate."
refutation: "Equivalent baseline coverage detects the same leakage and gate failure, or the changed path cannot expose either issue."
review_trigger: "The next distinct change to reviewer prompt inputs or the internal TDD completion gate."
---

## Origin evidence

- Project `sdk`, direct TDD session `01a21dda-7c46-7601-8e39-114413eaa3ab`, task removing the TDD output status and preserving reviewer independence. `src/orchestrator/phases/__tests__/ReviewHandler.test.ts`, "sends failed TDD output back for rework even when both reviewers approve". The test supplies a legacy incomplete report and approving reviewer responses, checks both prompts for a prior verdict, a report reference and a correction notice, and checks that tasks are not marked completed.
- Same task and session, final `npm run test` run at 14:16:09 on 2026-11-27, reported 161 test files and 1,601 tests passed. Detection on a different task is a prediction.

## Evaluations

No independent evaluation yet.

## Outcome

Candidate awaiting the next applicable distinct task.
