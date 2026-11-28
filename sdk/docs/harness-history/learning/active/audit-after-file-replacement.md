---
schema_version: 1
id: audit-after-file-replacement
revision: 1
status: candidate
feature_node_id: "feature:sdk_core"
phase: before-red
applies_when: "A change records a successful operation that depends on replacing a persisted file."
proposed_action: "Simulate replacement failure and assert that no success decision is recorded and the operation remains incomplete."
skip_when: "The operation has no success decision, cannot reach file replacement, or equivalent coverage checks the same failure and outcome."
prediction: "The failure-path test detects a success decision emitted before a failed replacement."
refutation: "An equivalent baseline test detects the premature success decision, or the failure path cannot expose the ordering defect."
review_trigger: "The next distinct change that records success after a persisted-file replacement."
---

## Origin evidence

- Project `sdk`, direct TDD session `01a21a31-e9da-7323-8cf6-bd80be969a9b`. `src/orchestrator/phases/__tests__/PhaseBHandler.test.ts`, "does not record a completed rework count correction when replacing TDD output fails". The test simulates a rename failure and checks the original count, absence of a correction decision, and incomplete task status.
- Same session, command `npm run test -- src/orchestrator/phases/__tests__/PhaseBHandler.test.ts`, execution chunk `5ef57a` at 21:02:27 local on 2026-11-26. RED failed because a correction decision was recorded after the simulated replacement failure. The final full-suite run passed 1,574 tests.

## Evaluations

No independent evaluation yet.

## Outcome

Candidate awaiting the next applicable change.
