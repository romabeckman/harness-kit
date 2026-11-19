# TASK
Invoke and follow the `harness-kit:project-memory` skill to prepare initial project documentation.
Inspect every configured project independently; do not combine evidence or documentation between projects.
For each project, check for `docs/.digest.md` and `docs/.graph.json`. If both exist, do not change that project's documentation.
Prepare or complete documentation only for projects listed under `projects_missing_docs`, keeping each project's files under its own `docs` directory.
Follow the skill to create: `docs/README.md`, `docs/.digest.md`, and `docs/.graph.json`,
`docs/adr/ARCHITECTURE.md`, `docs/adr/TESTS.md` for each project, only the required `docs/adr` files if not present.
Follow the skill's frontmatter, feature graph, digest, graph index, and README rules for each project.
Do not ask questions; use available project evidence.
Use the implementation scope below to understand the intended project and document planned work separately from current implementation evidence.
Return only the final output required by the skill.
{{*scopeSection}}

<project_paths_to_inspect>
{{*projectPaths}}
</project_paths_to_inspect>

<projects_missing_docs>
{{*missingDocsPaths}}
</projects_missing_docs>
