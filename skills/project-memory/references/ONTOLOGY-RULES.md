# ONTOLOGY RULES

## PURPOSE

Use a small domain vocabulary so AI consumers can identify rules, dependencies, decisions, and their evidence. Treat all artifacts as potentially generated. Evaluate what an artifact establishes, independently of its author.

## STORAGE AND OWNERSHIP

- REQUIRED: Store one fenced `json` block under `## KNOWLEDGE` in the owning ADR or feature document. Use the top-level shape `{"schema_version":1,"entities":[],"claims":[]}` and populate the arrays with relevant records; allow no additional top-level fields.
- REQUIRED: Keep the existing feature `graph` block for source routing. The knowledge block is separate and is not parsed by `generate_docs_graph.py`.
- REQUIRED: Exclude the ontology JSON graph block, including its fences, from the document's character count, following [MARKDOWN CHARACTER BUDGET](../SKILL.md#markdown-character-budget). Count the `## KNOWLEDGE` heading and surrounding prose. Record consequential knowledge only.
- REQUIRED: Use local IDs `<type>:<slug>` for entities and `claim:<slug>` for claims. Resolve cross-document IDs as `<node_id>#<local_id>` through `.graph.json` and the target knowledge block.
- REQUIRED: Give each concept one canonical owner. Reuse its qualified ID elsewhere; use aliases for synonyms within that domain. Never merge concepts solely because names match.
- REQUIRED: Preserve IDs across renames. Reconcile affected references when ownership changes; do not silently delete referenced concepts.
- REQUIRED: Use existing document `references` edges to make external concept owners discoverable. Keep semantic relations out of document routing edges.
- ALLOWED: Leave untouched legacy documents without knowledge blocks. When a needed target lacks a concept, read its evidence and add the concept only within authorized scope; otherwise keep the claim unresolved without a dangling ID.

## ENTITY CONTRACT

Each entity has exactly `id`, `type`, `label`, `definition`, and `aliases` (an array of strings). Use nonempty strings for the other fields. The ID prefix must equal its type.

| Type | Meaning |
|---|---|
| `capability` | A business or system behavior with an explicit boundary |
| `rule` | An invariant or constraint, including when it applies |
| `contract` | An interaction agreement, including inputs, outputs, and failure conditions |
| `decision` | An architectural choice; acceptance must be supported by a claim |

Definitions identify concepts; they do not establish implementation or approval. Put consequential assertions in claims. Do not invent types or relations during document generation. Express an unsupported relation as a plain assertion with null relation/object; vocabulary extensions require a separate skill contract update and version change.

## CLAIM CONTRACT

Each claim has exactly the following fields. Use `null` for inapplicable `relation` and `object`, and `[]` for absent evidence or derivation.
Use nonempty strings for IDs, statements, and non-null gaps; evidence records are objects and derivation references are strings.

| Field | Contract |
|---|---|
| `id` | Unique local `claim:<slug>` |
| `subject` | Local or qualified entity ID |
| `relation` | Relation below, or `null` for an assertion about the subject |
| `object` | Entity ID when relation is present; otherwise `null` |
| `statement` | One precise assertion including applicable conditions |
| `kind` | `requirement`, `observation`, or `hypothesis` |
| `status` | `supported`, `unresolved`, `conflicted`, or `stale` |
| `evidence` | Array of evidence records defined below |
| `derived_from` | Local or qualified claim IDs used in reasoning |
| `gap` | Missing evidence or conflict explanation; `null` only when supported |

`requirement` describes intended behavior explicitly established by an authorized request or accepted specification. `observation` describes inspected implementation or a bounded execution result. `hypothesis` describes an inference or proposal. Never promote a hypothesis merely because multiple generated artifacts repeat it.

## SEMANTIC RELATIONS

| Relation | Subject type | Object type | Meaning |
|---|---|---|---|
| `constrained_by` | capability, contract | rule | Subject must obey the rule within stated conditions |
| `exposes` | capability | contract | Capability provides the interaction described by the contract |
| `depends_on` | capability, contract | capability, contract | Subject requires the target within stated conditions |
| `governed_by` | capability, rule, contract | decision | Decision establishes a choice affecting the subject |

- REQUIRED: Record the relation once in its actual direction. Do not infer inverse or transitive claims without separate evidence.
- REQUIRED: Allow dependency cycles when evidence supports them. Reject circular derivation as proof.
- REQUIRED: Interpret a missing relation as unknown, not false. An explicit negative claim needs evidence and scope.
- PROHIBITED: Use macro `tested_by` edges or listed test files as proof that a capability passes tests.

## EVIDENCE CONTRACT

Each evidence record has exactly `kind`, `source`, `locator`, and `snapshot`.
Use nonempty strings for these fields, except `snapshot` may be `null`.

| Field | Contract |
|---|---|
| `kind` | `request`, `specification`, `code`, `configuration`, `test_definition`, or `execution` |
| `source` | Existing project-relative file path, or a retrievable external resource/message/run identifier |
| `locator` | Symbol, section, line range, message excerpt, or result identifier actually inspected |
| `snapshot` | Actual content hash, immutable revision, or run ID; `null` when unavailable |

- REQUIRED: Cite precise evidence; file existence alone proves no behavior. Record only identifiers actually observed. Reinspect mutable sources before reusing their claims; never invent hashes or timestamps.
- REQUIRED: Trace generated specifications and summaries to an authorized requirement or inspected artifact. A chain ending in another unsupported generated claim remains unresolved.
- REQUIRED: Use code as evidence of implementation, configuration as evidence of settings, and test definitions as evidence of intended checks. Only actual execution results support claims that checks ran or passed, within their recorded environment and scope.
- REQUIRED: Keep model-generated fixtures and synthetic datasets scoped to the experiment. They establish neither production behavior nor real-world prevalence.
- REQUIRED: For an inferred claim, record its premises in `derived_from` and explain the inference in `statement`. Supported premises alone do not establish the conclusion; keep it an unresolved hypothesis until independently grounded.
- PROHIBITED: Treat agreement between code and tests generated from the same assumption as independent proof that the assumption matches the requirement.

## STATUS AND RECONCILIATION

- `supported`: inspected evidence establishes this exact claim and its scope. Require nonempty evidence and `gap: null`; hypotheses cannot use this status.
- `unresolved`: evidence is absent, unavailable, or insufficient. State what would resolve the gap; retain useful hypotheses without inventing facts.
- `conflicted`: inspected sources disagree about the same kind of claim under the same conditions. Preserve both sources and explain the conflict.
- `stale`: relevant evidence changed since inspection. Retain the prior evidence locator; reclassify after checking the changed source.
- REQUIRED: Preserve separate requirement and observation claims when implementation violates intent. Document the mismatch without rewriting the requirement to fit code.
- REQUIRED: On updates, recheck affected claims and their dependents; do not mark unrelated claims freshly verified. Resolve supported status only from new inspection, never from editing prose or regenerating indexes.
- REQUIRED: Continue useful documentation work with explicit gaps. Ask the user only when a missing decision materially blocks the requested outcome.

## EXAMPLE

Illustrative unresolved proposal. Use real domain content when authoring; this example asserts no project facts.

```json
{
  "schema_version": 1,
  "entities": [
    {
      "id": "rule:payment-idempotency",
      "type": "rule",
      "label": "Payment idempotency",
      "definition": "The treatment of repeated payment requests sharing a key.",
      "aliases": []
    }
  ],
  "claims": [
    {
      "id": "claim:deduplicate-payment",
      "subject": "rule:payment-idempotency",
      "relation": null,
      "object": null,
      "statement": "Proposed: repeated requests with the same key create at most one charge.",
      "kind": "hypothesis",
      "status": "unresolved",
      "evidence": [],
      "derived_from": [],
      "gap": "An authorized requirement must establish key scope and retention period."
    }
  ]
}
```

## VALIDATION PROCEDURE

1. Parse the knowledge JSON and check the version, exact fields, enums, value types, and unique entity/claim IDs. Stop on unknown versions; do not silently rewrite them.
2. Resolve subjects, objects, and derivation IDs locally or through document IDs. Check relation endpoint types and reject circular derivation. Read only referenced owners needed for the affected records.
3. Inspect cited evidence, including locators and available snapshots. Check whether it establishes the statement's kind, conditions, and scope. Reclassify unsupported claims and preserve contradictory evidence.
4. Answer the task's relevant questions from the records: which rule applies, which capability depends on it, and what evidence supports the answer? Report missing knowledge explicitly.
5. Check that prose and digest preserve uncertainty and distinguish intended behavior from observed behavior. Report which checks actually ran.

These are authoring checks performed by the agent. The existing graph generator checks document routing only; it does not enforce this contract or prove factual correctness.
