---
schema_version: 1
id: refinement-agent-artifact-precedence
revision: 1
status: candidate
feature_node_id: "feature:sdk_core"
phase: before-red
applies_when: "A refinement task changes how the handler obtains a result that the agent must write to a file."
proposed_action: "Give the agent stub a usable response that disagrees with the file or arrives without the file. Assert that the handler uses the file or follows the specified missing-file behavior."
skip_when: "The response is an authorized source for that invocation, or an existing test already checks both sources with distinguishable results."
prediction: "At least one comparable test with disagreeing sources fails before implementation when the handler still reads or falls back to the response, while a test with only a valid file passes."
refutation: "On a distinct comparable task, the baseline test detects the same wrong-source behavior, or the proposed test fails to distinguish the faulty path."
review_trigger: "The next distinct refinement task changing which source is read or how the handler deals with a missing agent-written file."
---

## Origin evidence

- Project `sdk`, direct TDD session `codex:01a215e5-b941-7170-b88b-add53811a01b`. `src/orchestrator/phases/__tests__/RefinementPublication.test.ts`, "recomputes pending questions and publishes the refinement before advancing directly to Bootstrap". The mock writes pending questions to the file while returning a valid empty array. The assertions require the handler to ask the question from the file and persist its answer. Test snapshot blob `4af2a62347317382093b84cacc2162e58a0be7be`.
- Same project and session. Same test file, "ignores returned Markdown when the agent does not write REFINEMENT.md". Before the change, the focused run at 00:55:10 accepted the Markdown from the response and failed the assertion for the scope fallback. The file-only test "accepts a valid staged file when the agent returns no document" passed in that run.
- Same project and session. Focused verification at 01:01:19 with `npm run test -- src/orchestrator/phases/__tests__/RefinementPublication.test.ts src/file-state/__tests__/RefinementAtomicWrite.test.ts --silent --reporter=verbose`. All 18 tests passed, including the conflicting questions case and the missing Markdown file case.

## Evaluations

No independent evaluation recorded.

## Outcome

Candidate awaiting a distinct task that meets the review trigger.
