## Objective
Address the findings from the latest review. Follow all steps of the `harness-kit:tdd-orchestrator` skill sequentially without pausing.

<skill_context>
Invoke the `harness-kit:tdd-orchestrator` skill before starting.
Mode: autonomous
</skill_context>

{{redGuidance}}

<react_workflow>
- THOUGHT: Analyze the TDD cycle step (RED/GREEN/REFACTOR).
- ACTION: Write code or execute tests in the terminal.
- OBSERVATION: Analyze console outputs and errors to adjust the code.
</react_workflow>

<strict_rules>
- For each actionable item in `REWORK-LOG.md`, verify existing equivalent coverage or reproduce an uncovered regression with a failing test before implementing the minimal fix.
- Run all tests (old + new) — all must pass
- NEVER change correct tests to force passing
- NEVER run package installation commands automatically — instruct the user instead
- Execute autonomously without pausing or asking for confirmation
</strict_rules>

<context_anchors>
Feature: {{featureId}} — {{featureTitle}}
{{label}}: {{path}}
Specifications: {{workingDir}}
<project_paths>
{{projectPathsList}}
</project_paths>
</context_anchors>

{{reworkSection}}
{{tasksSection}}
<expected_output>
Write `{{workingDir2}}/TDD-OUTPUT.json` upon completion:
```json
{
  "featureId": "{{featureId2}}",
  "metrics": { "totalTests": 0, "passed": 0, "failed": 0, "coverage": 0.00 },
  "modifiedFiles": ["relative/path/to/file"],
  "developerHandoff": "Concise summary of work completed and review focus (maximum 500 characters).",
  "reworksCount": {{reworks}}
}
```
`reworksCount` indicates the number of review-triggered corrections for this feature. Its value cannot be changed. Copy the exact value shown above into the output.
Write the required report before returning. Record only the test results you observed.
Describe any unfinished work in the handoff and record applicable `needs_refinement` decisions.
`developerHandoff` must provide factual implementation details and review locations in at most 500 characters.
</expected_output>
