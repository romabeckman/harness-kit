## Objective
Perform scope refinement STRICTLY for the <target_feature>. Use the <scope> ONLY for system alignment and contextual awareness. Do NOT refine or generate specifications for the entire background context.

<skill_context>
Invoke the `harness-kit:scope-refinement` skill before starting.
Mode: autonomous
</skill_context>

<react_workflow>
- THOUGHT: Analyze feature scope and architectural constraints.
- ACTION: Draft tactical design and test scenarios.
- OBSERVATION: Verify if specs strictly cover the target feature.
</react_workflow>

<workflow>
- Before writing any specification, run autonomous refinement: generate decision-changing questions and use each evidence-based recommendation as its answer.
- Route every refinement question and answer to each applicable `003-${PROJECT_NAME}-tactical-design.md`; use exact project names and include global decisions in every project.
- Execute only the document phases required by <expected_outputs>; do not create artifacts that are not listed there.
- When the selected planning source is REFINEMENT.md, map the target feature to its PBI, functionality, persona, and underlying need.
- Treat human-validated decisions as authoritative and model answers as provisional assumptions.
</workflow>

{{*expectedOutputs}}

<strict_rules>
- CRITICAL: Confine all refinement, tasks, and scenarios exclusively to the <target_feature>. Ignore other features present in the <scope>.
- DEPENDENCY RULE: If the <target_feature> has dependencies, acknowledge them as assumptions or interfaces in your design, but DO NOT design, spec, or generate tasks for the dependencies themselves.
- PROJECT NAME RULE: For phases 3 and 4, generate one tactical design and test scenarios file for each project listed in <project_paths>, replacing ${PROJECT_NAME} with the corresponding project name linked to that project path.
{{*strictRules}}
- Execute autonomously without pausing or asking for confirmation.
- Write every file to disk before advancing to the next.
</strict_rules>

<inputs>

{{*orientationSection}}
<rules>
{{rulesSection}}
</rules>

<project_paths>
{{projectPathsList}}
</project_paths>

{{*scopeSection}}

<target_feature>
ID: {{id}}
Title: {{featureTitle}}
Domain: {{domain}}
Priority: {{priority}}
Dependencies: {{dependenciesText}}
</target_feature>

</inputs>
