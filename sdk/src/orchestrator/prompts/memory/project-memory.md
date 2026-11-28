## Objective
Persist development memory for the current development scope. Organize documents by topic; avoid redundant or repetitive text.
Keep each project's architecture, feature, and business documents in its own documentation folders.

<skill_context>
Invoke the `harness-kit:project-memory` skill before starting.
Mode: autonomous
</skill_context>

<instructions>

## Workflow
1. Execute autonomously without pausing or asking for confirmation.
2. Follow the `harness-kit:project-memory` document contract and the reference for each document type before writing.
3. Read `{{backlogFile}}` to identify completed features and their `Domain` values, then read the corresponding specification sources at `{{specsPattern}}`. Update feature documentation inside each target project, not inside the specification directory.
4. If an existing document already covers this feature's changes, fixes, updates or improvements, update that file. Otherwise, create a new one.
5. If architectural changes were introduced (new layers, patterns, integrations, test strategy changes), update the corresponding `docs/adr/*.md` file following its own rules file.
6. Read `docs/business/intent.md` when present and create it if missing within scope. Update relevant business documents when the cycle establishes a supported business decision. Apply Project Memory's business rules.
7. Synchronize affected documentation indexes, including `docs/README.md`, `docs/.digest.md`, and `docs/.graph.json`, as applicable.

## File Organization
- For each project listed in `<project_paths>`, create or modify topic documents under `docs/adr/`, `docs/feature/`, or `docs/business/`. Apply Project Memory's scope rules to index and README updates.
- Specification docs (SDD) live at `{{specsPattern2}}`, grouped by the `Domain` column from BACKLOG.md.
- Feature docs live directly under `docs/feature/*.md`. Preserve an existing project naming convention; otherwise default to a stable domain-based filename such as `docs/feature/<domain>.md`. Never prefix filenames with feature IDs such as F001 or F002.

## Content Rules
- Use the Project Memory template for the document type.
- Write for a future LLM with no access to source files: state what the feature does, why it exists, key decisions, constraints — never how it was implemented step-by-step.
- AVOID code snippets. Only include one when prose cannot convey it (public interface signature, fixed schema, non-obvious config key), and keep it to a few lines. Never paste full functions, classes, or file contents — reference the file path instead.
- The `FOLDER STRUCTURE` section must reflect the module's current relevant structure, adding this cycle's paths without dropping paths from prior cycles.
- References must use relative links to existing Markdown under the same project's `docs/adr/`, `docs/feature/`, or `docs/business/`. Validate each link before finalizing.

## Prohibited
- NEVER include TDD/validation/score details in feature docs — those belong in DECISIONS.md only.
- NEVER add process history or speculative future-work notes.
- NEVER create a new ADR file unless explicitly requested by a human.
- NEVER read, create, or modify any file under `docs/harness-history/`.

</instructions>

<verification_sources>
- Decisions: `{{decisionsFile}}`
- Final Tech Lead reviews: `{{tlPattern}}`
- Final adversarial QA reviews: `{{qaPattern}}`
- Rework records when present: `{{reworkPattern}}`
- Run `git status -s` in each project to inventory changed files.
Use these sources only to verify delivered behavior, decisions, and relevant paths. Do not copy scores, validation chronology, or implementation process into feature documentation.
</verification_sources>

<recent_decisions>
{{*lengthSection}}
</recent_decisions>

{{*orientationSection}}
<scope>
```markdown
{{scope}}
```
</scope>

<project_paths>
{{projectPathsList}}
</project_paths>

<rules>
{{rulesSection}}
</rules>
