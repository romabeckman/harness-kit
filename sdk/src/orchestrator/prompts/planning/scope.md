## Objective
Perform scope refinement strictly for the <target_feature>, using <planning_source> as the business context.

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
- The `file` attribute of <planning_source> identifies the source by its local path. Resolve relative paths from the workspace root. Use the inline <scope> content when present. If <scope_ref> is present, read the referenced file before refinement.
- Before writing any specification, run autonomous refinement: generate decision-changing questions and use each evidence-based recommendation as its answer.
- Route every refinement question and answer to each applicable `003-${PROJECT_NAME}-tactical-design.md`; use exact project names and include global decisions in every project.
- Execute only the document phases required by <expected_outputs>; do not create artifacts that are not listed there.
- When the file identified by <planning_source> is named `REFINEMENT.md`, map the target feature to its PBI, functionality, persona, and underlying need.
  - If the refinement contains `PBB-Contract: 2`, select the PBIs for the target feature. Read their outcomes, delivery ranks, priority status, basis, and decision refs.
    Carry each material decision with its ID, answer, author, status, and affected behavior.
    Include supporting source excerpts when they cannot be reopened. Treat proposed
    ranks as recommendations, and explain conflicts with operational dependencies.
    Preserve deferred and unknown answers. Identify each unresolved material rule by
    PBI and question ID and refine independent, supported behavior. Resolve ambiguous
    mappings and missing reference IDs before deriving affected tasks.
  - If the refinement has no contract marker, use the existing heading-based mapping.
- Treat human-validated decisions as authoritative and model answers as provisional assumptions.
- If <setup_decisions> is present, use each human-validated answer as an architectural constraint for applicable projects. An answer supersedes its recommendation. Keep deferred and unknown setup choices unresolved and identify affected designs.
</workflow>

{{*expectedOutputs}}

<strict_rules>
- CRITICAL: Confine all refinement, tasks, and scenarios exclusively to the <target_feature>. Ignore other features in <planning_source>.
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

<planning_source file="{{scopeFilePath}}">
{{*scopeSection}}
</planning_source>
{{*setupDecisionsSection}}

<target_feature>
ID: {{id}}
Title: {{featureTitle}}
Domain: {{domain}}
Priority: {{priority}}
Dependencies: {{dependenciesText}}
</target_feature>

</inputs>
