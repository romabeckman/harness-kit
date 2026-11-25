---
schema_version: 1
id: refinement-replacement-failure
revision: 1
status: candidate
feature_node_id: "feature:sdk_core"
phase: before-red
applies_when: "A change modifies publication or replacement of a persisted refinement document."
proposed_action: "Exercise a denied rename with a previously valid refinement and check that its content survives."
skip_when: "Equivalent coverage already checks the same replacement failure and previous-file state, or the change cannot affect publication."
prediction: "The test detects a fallback that overwrites the existing refinement after rename failure before review."
refutation: "An equivalent baseline test detects the same failure or the changed path cannot reach the replacement operation."
review_trigger: "The next change to refinement publication or its file-state replacement."
---

## Origin evidence

- Project `sdk`, direct TDD run at 19:20:04 on 2026-11-25. `src/file-state/__tests__/RefinementAtomicWrite.test.ts`, “preserves the prior refinement when replacement is denied”. The RED run failed because the EPERM fallback copied over the existing document. The test passed after publication used a unique temporary directory and rename.

## Evaluations

No independent evaluation yet.

## Outcome

Candidate awaiting the next applicable change.
