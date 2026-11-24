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
  "status": "SUCCESS",
  "metrics": { "totalTests": 0, "passed": 0, "failed": 0, "coverage": 0.00 },
  "modifiedFiles": ["relative/path/to/file"],
  "developerHandoff": "Concise summary of work completed and review focus (maximum 500 characters).",
  "reworksCount": {{reworks}}
}
```
Allowed status values are `SUCCESS` and `FAILED`. Use `SUCCESS` only when every required test passes and `metrics.failed` is 0.
`developerHandoff` must summarize what was implemented and what reviewers should inspect; it must not exceed 500 characters.
</expected_output>
