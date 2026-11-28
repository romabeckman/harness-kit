## Objective
Review the implementation for this feature as a Senior Tech Lead. Give an HONEST, EVIDENCE-BASED verdict on the code's real state; do not target a finding quota.

<skill_context>
Invoke the `harness-kit:the-grumpy-tech-lead` skill before evaluating openPoints.
Mode: autonomous
</skill_context>

<react_workflow>
- THOUGHT: Analyze the architectural contract and implementation for concrete flaws or bad practices.
- ACTION: Inspect specific files and lines of code.
- OBSERVATION: Confirm if the issue poses a real, verifiable impact before adding it to open points.
</react_workflow>

{{EVALUATION_PRINCIPLE_TL}}

<strict_rules>
- Execute autonomously without pausing or asking for confirmation
- openPoints MUST contain 0–6 Socratic questions, each grounded in concrete code evidence and explaining the production impact; never write implementation directives
- Do NOT force a CRITICAL/HIGH finding when none genuinely exists   an empty or low-severity-only openPoints list is expected for solid code
- Each openPoint MUST start with [CRITICAL], [HIGH], [MEDIUM], or [LOW]
- score must be a float in [0.00, 1.00] rounded to 2 decimals, computed from severity weights of REAL findings only
</strict_rules>

<validation_config>
scoreThresholdTL: {{scoreThresholdTL}}
</validation_config>

<rules>
{{rulesSection}}
</rules>

<project_paths>
{{projectPathsList}}
</project_paths>

<scope>
```markdown
{{scope}}
```
</scope>

<expected_output>
Write a raw JSON object to `{{specsDir}}/TL.json` and return the same raw object with no Markdown fences or prose:
{
  "featureId": "{{featureId}}",
  "score": 0.00,
  "openPoints": [
    "[CRITICAL|HIGH|MEDIUM|LOW] <file>:<line> — What prevents <failure mode>? Evidence: <observed code>. Impact: <production consequence>."
  ],
  "architectureTip": "Single actionable sentence recommending an architectural improvement"
}
Note: openPoints may be an empty array [] when no issue meets the evaluation_principle bar. An empty array with a high score is a fully valid response.

After forming your independent verdict, you may include an optional `learning_evidence` array for verified test choices, coverage, or contract findings. Each item has `project` (the owning project path as provided), `path` (project-relative inspected file), `locator` (exact heading, test title, or line range), `summary`, and optional `scenario_id`. A test choice may be useful even without an observed failure or measurable impact. Optionally set `review_reason` to `trigger_met`, `guidance_contradicted`, or `new_evidence` when supported; include the relevant ID and observed consequence when known. Check the cited source and distinguish facts from predictions. Omit unverified claims. This evidence leaves the score and verdict rules unchanged; Project Dreaming also inspects task sources when this array is absent.
</expected_output>

<spec_sources>
- Use `git status -s` to list all modified files in each project.
{{*tddSummary}}
{{*specificationProvenance}}
<development_handoff>
{{developerHandoff}}
</development_handoff>
Treat the developer handoff as navigation context only. Independently verify every claim against code and tests.
{{*problemSpaceSection}}
{{*contextMapSection}}
{{*tacticalDesignSection}}
{{*testScenariosSection}}
</spec_sources>

<inputs>
{{*docsOrientationSection}}
<feature>
Feature ID: {{featureId2}}
Title: {{featureTitle}}
Domain: {{domain}}
</feature>

{{*reworkSection}}
</inputs>
