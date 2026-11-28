# Document contract

Read before any canonical edit, including consolidation or digest demotion. Read only the matching reference below; use its template for creation and preserve unaffected sections during updates.

## Ownership and templates

| Target | Reference | Contract |
|---|---|---|
| `docs/adr/ARCHITECTURE.md` | [ARCHITECTURE-RULES.md](ARCHITECTURE-RULES.md) | Architecture, layers, patterns, integrations; keep module summaries to name, purpose, and feature link |
| `docs/adr/TESTS.md` | [TESTS-RULES.md](TESTS-RULES.md) | Actual test strategy, configuration, and commands |
| Other `docs/adr/**/*.md` | [DOCUMENT-TEMPLATE.md](DOCUMENT-TEMPLATE.md) | One architectural decision or technical responsibility |
| `docs/feature/**/*.md` | [DOCUMENT-TEMPLATE.md](DOCUMENT-TEMPLATE.md); [ONTOLOGY-RULES.md](ONTOLOGY-RULES.md) for consequential knowledge | One feature/domain; canonical concepts and claims |
| `docs/business/**/*.md` | [BUSINESS-RULES.md](BUSINESS-RULES.md) | Business purpose, goals, and other supported business topics. Macro graph entries only. |
| `docs/README.md` | [README-RULES.md](README-RULES.md) | Navigation only; exact template casing; no YAML frontmatter, technical explanations, or REFERENCES section |
| `docs/.digest.md`, `docs/.graph.json` | [INDEX-RULES.md](INDEX-RULES.md) | Derived orientation and routing; no independent claim ownership |
| Root `README.md` | Existing structure | Targeted minimal edits; keep technical detail in owning docs |

- REQUIRED: Only `ARCHITECTURE.md` and `TESTS.md` are mandatory ADRs. Follow the [architecture catalog](ARCHITECTURE-RULES.md#document-catalog) for when to create additional ADRs, including a suggested ADR for an evidence-backed rule or decision within authorized scope. Compact existing ADRs before proposing a size-driven split beyond that scope.
- REQUIRED: Keep specialized ADRs linked to architecture. Subfolders are allowed inside `docs/adr/`, `docs/feature/`, and `docs/business/`; do not introduce other documentation trees through this skill.
- REQUIRED: `docs/business/intent.md` is the only mandatory business document; apply the business reference to create other business documents when justified.
- REQUIRED: Apply the whole-file limits in [TOTAL CONTEXT BUDGET](../SKILL.md#total-context-budget) to each generated or updated Markdown file.

## Metadata and routing

- REQUIRED: Every ADR/feature starts with YAML containing `doc_type`, `domain`, `stack`, `node_id` (`<type>:<slug>`), `tags` (2-5 terms), `edges`, and `updated`. Preserve IDs across renames; change dates only for actual document changes.
- REQUIRED: Each `edges` entry uses `relation` and `target`; never duplicate the target's path there. Resolve document IDs through `.graph.json`.
- REQUIRED: Use relations `implements`, `depends_on`, `tested_by`, `references`, or `child_of`. Use `references` between ADRs; `tested_by` links a feature to its test-strategy ADR and never proves test execution. Do not encode reciprocal copies of the same relation.
- ALLOWED: Feature edges may include `read: must | optional`. Optional targets require a nonempty `when` of at most 300 characters; must-read targets prohibit `when`. Never duplicate a routing target or classify it as both.
- REQUIRED: Every feature has exactly one fenced `graph` JSON object directly after YAML. Include `node_id`, `domain`, `implements`, `tested_by`, and routing arrays `entrypoints`, `registration_files`, `reference_files`, `code_files`, `test_files`. Use project-relative existing files, each in exactly one array; use empty arrays for inapplicable roles.
- REQUIRED: Put consequential feature knowledge only in that object's `knowledge`, using the existing ontology schema. ADRs contain evidence in prose and omit the entire graph. README and digest contain no feature graph or knowledge.
- PROHIBITED: Copy implementation paths, ontology records, or evidence into macro graph nodes. Global indexes route to canonical documents; they do not duplicate their contents.

## Presentation

- REQUIRED: Use standard Markdown and uppercase feature/ADR section headings; REFERENCES goes last. Follow the navigation template's own casing for `docs/README.md`; preserve the root README structure.
- REQUIRED: In `## REFERENCES` of generated or updated ADR, business, and feature documents, link only to existing Markdown documents within the same project's `docs/adr/`, `docs/business/`, or `docs/feature/`. Use relative links and verify each resolved target. If no managed document applies, state that briefly. Inspecting source code, configuration, or other evidence for grounding does not make it eligible for this section.
- ALLOWED: A feature's published RED guidance uses the exact heading `## RED guidance` before REFERENCES. Follow the [publication procedure](RED-ORIENTATION.md) for guided edits to this section.
- REQUIRED: Serialize every generated JSON payload, including examples, on exactly one physical line with `json.dumps(data, ensure_ascii=False, separators=(',', ':'))`. Keep fences separate; preserve escaped newlines inside strings and never insert comments into JSON.
- REQUIRED: Keep folder trees at folder/layer level with representative entries. Do not repeat the source inventory already owned by the feature graph.
- ALLOWED: Add a Mermaid `graph TD` DOCUMENT MAP only when it explains more than existing edges and references. Omit it for a single edge; do not repeat the same relation three times without added value.
- REQUIRED: Use direct instructions and `REQUIRED:`, `PROHIBITED:`, or `ALLOWED:` for constraints. Use tables for comparisons/parameters and numbered lists for sequences. Label instructional code examples CORRECT/WRONG outside JSON payloads.
- PROHIBITED: Unresolved template placeholders, decorative material, generic introductions, and redundant prose. Keep prose navigation links meaningful; evidence may cite inspected code, configuration, requirements, or retrievable execution artifacts without granting permission to modify or access excluded resources.
