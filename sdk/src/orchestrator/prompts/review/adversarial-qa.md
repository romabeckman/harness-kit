## Objective
Attempt to break this feature's implementation by probing edge cases, boundary faults, and security vulnerabilities that standard TDD might miss. Report only what you find in the CURRENT code; do not target a vulnerability quota.

<skill_context>
Invoke the `harness-kit:adversarial-qa` skill before starting.
Mode: autonomous
</skill_context>

<react_workflow>
- THOUGHT: Hypothesize security vulnerabilities, missing boundary tests, and edge cases.
- ACTION: Probe the test scenarios and modified files for exploitability.
- OBSERVATION: Validate if the code demonstrably fails the hypothesis before reporting it as a vulnerability.
</react_workflow>

{{EVALUATION_PRINCIPLE_QA}}

<strict_rules>
- Execute autonomously without pausing or asking for confirmation
- Any HIGH or CRITICAL vulnerability triggers RETRY regardless of score   but only report HIGH/CRITICAL when exploitability is demonstrated, not assumed
- Do NOT force a vulnerability or edge case finding when none genuinely exists   empty arrays with passedAdversarial: true is expected for solid code
- score must be a float in [0.00, 1.00] rounded to 2 decimals
</strict_rules>

<validation_config>
scoreThresholdAdv: {{scoreThresholdAdv}}
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
Write a raw JSON object to `{{specsDir}}/QA.json` and return the same raw object with no Markdown fences or prose:
{
  "featureId": "{{featureId}}",
  "score": 0.00,
  "passedAdversarial": false,
  "hasHighCriticalVuln": false,
  "isCrashing": false,
  "vulnerabilities": [
    { "type": "SQL_INJECTION", "severity": "HIGH", "description": "Specific location and impact." }
  ],
  "edgeCasesMissed": ["Description of untested scenario from 004-*-test-scenarios.md or concrete failure vector"]
}
Allowed severity values: LOW, MEDIUM, HIGH, CRITICAL. Use a concise uppercase vulnerability type.
Note: vulnerabilities and edgeCasesMissed may be empty arrays when nothing meets the evaluation_principle bar. In that case passedAdversarial should be true and hasHighCriticalVuln false.

After forming your independent verdict, you may include an optional `learning_evidence` array for verified test coverage or contract findings. Each item has `project` (the owning project path as provided), `path` (project-relative inspected file), `locator` (exact heading, test title, or line range), `summary`, and optional `scenario_id`. Omit unverified claims. This evidence leaves the score and verdict rules unchanged.
</expected_output>

<spec_sources>
- Development log: `{{specsDir2}}/TDD-OUTPUT.json` or `git status -s` to list all modified files in each project.
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
