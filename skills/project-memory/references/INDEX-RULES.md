# Derived memory indexes

Read during digest curation and final synchronization. Preserve the existing index schemas; do not add stores, telemetry, or automatic scheduling.

## Digest selection

The digest is a small orientation layer. Its canonical details remain in ADRs/features; inclusion does not guarantee automatic injection into another session.

1. Start from the existing digest, inspected baseline facts, and selected findings. Do not reread all feature documents to fill it.
2. Promote grounded knowledge when it is broadly useful across future project tasks, consequential if missed, and not already conveyed by a shorter entry. Examples: a cross-cutting invariant, a verified recurring trap, or a decision governing many changes. Evidence of recurrence must be observed, not assumed. Do not restrict learning to failures alone.
3. Keep feature-specific conditions, volatile state, secondary metadata, and detailed examples in their canonical owner. When demoting useful detail, confirm that owner retains it and leave a short relative path or qualified claim ID where discovery still matters.
4. Retire obsolete summaries only after checking their grounding and affected references. Preserve material unresolved/conflicted warnings as explicitly qualified warnings with a canonical locator; never present them as established constraints.
5. Never promote a hypothesis because it appears in several generated notes. Preserve requirement/observation status, exceptions, and scope. If compression would erase those qualifiers, retain a pointer instead of the claim.

<output_contract target="docs/.digest.md">

Every created or updated digest must contain `DOCUMENTATION INDEX`, `ROUTING`, and `LAST UPDATED`. Include `ARCHITECTURE`, `TESTS`, and `CONSTRAINTS` when grounded content applies; do not invent facts to fill them. Omit YAML frontmatter, feature graph/knowledge blocks, and a REFERENCES section.

| Section | Contents |
|---|---|
| `ARCHITECTURE` | Inspected pattern, layers, DI approach, and stack from the architecture ADR |
| `TESTS` | Verified framework, configured run commands, and actual coverage gates; label targets as targets |
| `CONSTRAINTS` | Selected cross-cutting rules and durable findings; qualified warnings where material |
| `DOCUMENTATION INDEX` | Only `docs/adr/ARCHITECTURE.md` and `docs/adr/TESTS.md`, each with one-line description; mark a missing baseline explicitly rather than implying it exists; then the exact pointer below |
| `ROUTING` | Exact supplied path first; otherwise graph tags/one-hop edges, selected feature's top graph, then relevant knowledge/evidence or routed implementation files. Other prose only for needed design context |
| `LAST UPDATED` | Date the digest content actually changed; do not refresh merely because maintenance ran |

Required index pointer: "Required read `docs/.graph.json` for the complete document list, tags, and relations."

- REQUIRED: Stay below 60 total lines and at most 3,000 characters, counting all content. Rank retained knowledge by consequence and future relevance; remove repetition before conditions or evidence locators.
- REQUIRED: Use plain relative document paths, optionally in backticks; no Markdown links, absolute paths, or `file://` URIs. Use feature document paths/qualified claim IDs to locate findings; do not copy implementation paths.
- PROHIBITED: Enumerate all features/ADRs or reproduce ontology records. Store those details in their existing owners.
- REQUIRED: Write only when selected content, routing, required structure, or a missing digest needs an authorized change. Missing support stays explicit; unavailable facts do not become invented baseline values.

</output_contract>

## Publication and validation

<procedure name="publication_and_validation">

Run these actions in order. Resolve script paths from this skill directory; pass the target project's docs path, not the skill's references directory.

1. **Validate canonical edits.** Read [DOCUMENT-CONTRACT.md](DOCUMENT-CONTRACT.md) for authored documents. Check size, valid compact JSON, unique IDs, existing routing paths, section contracts, relevant prose links, and preserved uncertainty. Apply the ontology semantic gate to scoped feature knowledge; full reviews give every scoped feature a disposition. Structural success alone is not factual support.
2. **Synchronize macro routing when affected.** If document inventory, title, tags, edges, reading policy, or project relationships changed, or the index is missing/stale within scope, run `python scripts/generate_docs_graph.py <target_docs_dir>`. Body/claim-only edits do not require rewriting an equivalent graph. If routing was assessed without authorized writes, call the script's read-only `build_docs_graph` function and compare against the existing index instead of running its writing CLI. This parser requires PyYAML; report unavailable validation dependencies.
3. **Reconcile project relationships when relevant.** Apply the contract below after generation, which preserves existing links. Do not rebuild indexes only to add an unchanged date or empty maintenance marker.
4. **Validate ontology.** For changed ADRs/features, run `python scripts/validate_ontology.py <target_docs_dir> --document <node_id>`; repeat `--document` for each changed document. For a full review, omit the selectors. For a consolidation without edits, select the assessed feature IDs when checking their records. The validator follows qualified references and is read-only. An absent/unusable macro index is a validation gap, not permission to write in read-only mode.
5. **Synchronize human navigation when affected.** On added/removed/renamed documents or changed navigation descriptions, read [README-RULES.md](README-RULES.md) and reconcile `docs/README.md` with actual files and valid graph nodes. In a full review, check the complete scoped index. Remove a row only when its file no longer exists; a stale graph alone does not establish deletion. Preserve the existing README when navigation is equivalent.
6. **Check the final state.** Recheck modified files' size and JSON after synchronization, graph target resolution, affected links, README agreement, and digest selection/qualifications. Limit fixes to authorized scope; report unrelated failures. Report only checks actually run and never equate valid structure with verified evidence or improved LLM accuracy.

No-change runs perform the applicable read-only checks and stop. Do not bootstrap unrelated baselines, regenerate indexes, or update dates to manufacture an artifact. Honor the selected budget and report unassessed work rather than expanding into another cycle.

</procedure>

## Completion gate

<completion_gate name="publication">

- REQUIRED: Correct structural errors introduced by this run and rerun affected checks. If correction is impossible, withdraw only the faulty edits from this run while preserving prior and concurrent work; report the undelivered change. A review budget limits discovery, not output integrity.
- REQUIRED: Report successful validation only when the required checks actually pass. Explicit evidence gaps or unassessed scope permit a partial result with structurally valid outputs; they do not establish full semantic coverage.
- REQUIRED: Report validation as blocked when a required check cannot run or fails because of an unresolved preexisting issue. Identify the failing check, affected files, and unverified outputs. Do not expand scope to repair unrelated artifacts or claim completion. In read-only mode, report findings without repairing or withdrawing existing content.

</completion_gate>

## Macro graph contract

- REQUIRED: Keep document `nodes[]` and `edges[]` compatible with the generator. Feature reading policy is represented as `related_docs.must_read` (target IDs) and `related_docs.optional` (`target`, `description` from `when`). Global edges contain only `source`, `target`, `relation`; do not copy `read` or `when` there.
- REQUIRED: Generate compact JSON. Sort nodes by `id` and edges by `source`, `relation`, then `target`.
- REQUIRED: Reject duplicate document IDs, unresolved targets, duplicate reading-policy targets, conflicting must/optional classification, invalid/missing optional `when`, or `when` exceeding 300 characters. Repair using inspected owners, never invented pages.
- PROHIBITED: Copy feature routing arrays, concepts, claims, or evidence into macro nodes. A graph build validates routing, not truth.

## Project relationship contract

- REQUIRED: Top-level `related_projects` is an array, including `[]` when no relationships are established. Each entry contains exactly `key` and `relation`; sort by key then relation and remove exact duplicates.
- REQUIRED: Interpret `depends_on` as this project consuming the related project's capability; `provides_to` means this project supplies it. Keep both entries when evidence establishes both directions.
- REQUIRED: Confirm a new key using Harness Memory `search_projects` or an already confirmed cache entry. Establish direction from an explicit user statement, inspected documentation, or MCP relationship evidence; cache names alone establish neither direction nor relationship.
- REQUIRED: Preserve verified existing links when cache/MCP is unavailable. Remove a link only on evidence establishing removal. Keep external project keys outside document edges.
- REQUIRED: Omit an unconfirmed new link and report the gap. Ask about direction only when the missing decision materially blocks the requested result; otherwise finish useful local work.
