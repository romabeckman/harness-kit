## Objective
Extract ordered development tasks from the tactical design and append them to DEVELOPMENT-STATE.md.

{{*orientationSection}}
<project_paths>
{{projectPathsList}}
</project_paths>

Read all files matching `{{tacticalDesignFile}}`.
Locate the fenced JSON array containing task objects with "title" and "id" fields.
For each task object, append a row to docs/product/DEVELOPMENT-STATE.md using this format:
| {{id}} | T<zero-padded id> | <project path> | <title> | {{domain}} | - | NOT_STARTED |
where <project path> is the project name corresponding to the project in `project_paths`.
Do not output anything else.
