## Objective
Execute the TDD workflow for the tasks listed below. Follow all steps of the `harness-kit:tdd-orchestrator` skill sequentially without pausing.

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
- You MUST read `docs/.digest.md` and `docs/.graph.json` (or fallback to `docs/README.md`, `docs/adr/ARCHITECTURE.md`, and `docs/adr/TESTS.md`) in each project before writing any code
- Each project MUST have its own `docs/adr` and `docs/feature` folders where all ADRs and features are stored.
- Read the project-scoped Refinement Questions and Answers in the matching tactical design and treat confirmed answers as implementation constraints.
- Execute autonomously without pausing or asking for confirmation
- NEVER change correct tests to force passing
- NEVER run package installation commands automatically — instruct the user instead
</strict_rules>

<rules>
{{rulesSection}}
</rules>

<project_paths>
{{projectPathsList}}
</project_paths>

<expected_output>
Write `{{workingDir}}/TDD-OUTPUT.json` upon completion:
```json
{
  "featureId": "{{featureId}}",
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

<development_specifications>
{{*specsSection}}
</development_specifications>

<inputs>
{{*orientationSection}}
<feature>
Feature ID: {{featureId2}}
Title: {{featureTitle}}
Domain: {{domain}}
</feature>

{{reworkSection}}
{{tasksSection}}
</inputs>
