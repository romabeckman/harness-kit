---
schema_version: 1
id: debug-snapshot-raw-bytes
revision: 1
status: candidate
feature_node_id: "feature:sdk_core"
phase: before-red
applies_when: "A change affects preservation of agent-written diagnostic artifacts that may be malformed or normalized."
proposed_action: "Exercise debug preservation with malformed byte content and assert that the saved copy matches the original bytes."
skip_when: "The artifact has no byte-preservation contract or equivalent coverage checks malformed input and the saved bytes."
prediction: "The test detects a snapshot implementation that parses or normalizes the artifact before preserving it."
refutation: "Equivalent baseline coverage detects the same corruption or the changed artifact is never parsed or normalized."
review_trigger: "The next distinct change to debug preservation of an agent-written artifact."
---

## Origin evidence

- Project `sdk`, direct TDD session `01a21dda-7c46-7601-8e39-114413eaa3ab`, debug-copy task. `src/orchestrator/phases/__tests__/PhaseBHandler.test.ts`, "preserves the exact development report only when debug is %s" writes malformed BOM-prefixed bytes and compares the debug copy with the original when enabled, also checking that disabled debug creates no copy.
- Same session, final `npm run test` at 16:16:36 on 2026-11-27 reported 161 files and 1,609 tests passed. Detection on a future change remains a prediction.

## Evaluations

No independent evaluation yet.

## Outcome

Candidate awaiting the next applicable distinct task.
