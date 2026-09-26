# ONTOLOGY RULES

## PURPOSE

Use a small domain vocabulary so AI consumers can identify rules, dependencies, decisions, and their evidence. Treat all artifacts as potentially generated. Evaluate what an artifact establishes, independently of its author.

## STORAGE AND OWNERSHIP

- REQUIRED: Serialize the knowledge JSON on one physical line without indentation or formatting line breaks. Keep Markdown fences on separate lines and preserve escaped newlines within string values.
- REQUIRED: Store one fenced `json` block under `## KNOWLEDGE` in the owning ADR or feature document. Use the top-level shape `{"schema_version":1,"entities":[],"claims":[]}` and populate the arrays with relevant records; allow no additional top-level fields.
- REQUIRED: Keep the existing feature `graph` block for source routing. The knowledge block is separate and is not parsed by `generate_docs_graph.py`.
- REQUIRED: Count the entire `## KNOWLEDGE` section toward the 10,000-character file limit. Record consequential knowledge only.
- REQUIRED: Use local IDs `<type>:<slug>` for entities and `claim:<slug>` for claims. Resolve cross-document IDs as `<node_id>#<local_id>` through `.graph.json` and the target knowledge block.
- REQUIRED: Give each concept one canonical owner. Reuse its qualified ID elsewhere; use aliases for synonyms within that domain. Never merge concepts solely because names match.
- REQUIRED: Preserve IDs across renames. Reconcile affected references when ownership changes; do not silently delete referenced concepts.
- REQUIRED: Use existing document `references` edges to make external concept owners discoverable. Keep semantic relations out of document routing edges.
- ALLOWED: Leave legacy documents outside the selected scope untouched. Within a full review, assess legacy documents even without existing knowledge. If a referenced owner is outside authorized scope, keep a local unresolved assertion with null relation/object and describe the missing target in `gap`; never invent a dangling ID.

## SCOPE AND EXTRACTION

1. Select **targeted update** for a named correction or feature change; include affected claims and their referenced owners. Select **full review** when the user requests ontology enrichment, audit, or regeneration across a docs scope. A directory alone does not imply full review.
2. For a full review, inventory actual ADR/feature files within scope and reconcile the macro index. Track each as assessed with knowledge, assessed with no consequential knowledge (reason), or unresolved (missing evidence). Keep this inventory in working notes and summarize it at delivery; do not create another permanent index.
3. For each domain, ask what operation it enables, what must remain true, which boundary it exposes or consumes, and which choice governs it. Use existing IDs before creating concepts. Versions and dependency lists alone do not describe behavioral domains.
4. Trace a representative operation from entrypoint to validation, decision, dependency call, state change, and failure/cancellation handling. Inspect relevant branches and constraints; stop when the scoped questions are answered or the missing evidence is identified. Do not read every source file.
5. Extract capabilities from outcomes, rules from enforced or required invariants, contracts from inputs/outputs/errors, and decisions from established choices. Keep observations separate from requirements; do not infer design intent from code alone.
6. Connect entities using supported relations: capability constrained by rule, capability exposing contract, dependency on another capability/contract, or behavior governed by decision. Create relations only when evidence establishes them; no minimum entity or edge quota.
7. Cite the exact guard, call, declaration, request, or execution result supporting each claim. Preserve scope and exceptions in the statement. If only metadata is relevant to the task, metadata-only knowledge is sufficient; explain that scope.
8. Reconcile with existing knowledge, preserve uncertainty, and apply the completion gate below. Do not add redundant claims merely to populate the section.

## SEMANTIC COMPLETION GATE

- REQUIRED: For each scoped behavioral domain, answer from knowledge records: what capability is provided, which applicable rule or contract constrains it, what dependency matters for a change, and where the supporting evidence is located.
- REQUIRED: Mark each question answered by claim IDs, not applicable with a reason, or unresolved with a concrete evidence gap. Answer using existing records and inspected sources; do not fabricate relations to satisfy the gate.
- REQUIRED: If prose describes a consequential invariant or dependency absent from knowledge, reconcile it or record why it remains unresolved. Metadata-only records do not complete a behavioral review.
- REQUIRED: When checking change impact, distinguish explicitly recorded dependents from inferred impact; do not claim completeness beyond assessed scope.
- REQUIRED: Finish only when every scoped document has a disposition and every applicable question has an answer or explicit gap. A review with gaps may finish, but report partial grounding; never claim full semantic coverage.
- REQUIRED: Report structural validation and semantic assessment separately. Neither measures improved LLM accuracy; that requires a separate task-based comparison.

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

## CONNECTED EXAMPLE

Illustrative inspected fixture, not project evidence. Suppose `src/payments.py`, function `charge`, actually contains:

```python
# CORRECT: evidence fixture for this example only
def charge(request, gateway):
    if request.amount <= 0:
        raise ValueError("amount must be positive")
    return gateway.charge(request.amount)
```

The guard supports an implementation observation; it does not establish who approved the rule. The call supports the exposed function contract. Replace fixture paths and concepts with inspected project content when authoring.

```json
{"schema_version":1,"entities":[{"id":"capability:charge-payment","type":"capability","label":"Charge payment","definition":"Submit an amount to the payment gateway.","aliases":[]},{"id":"rule:positive-amount","type":"rule","label":"Positive amount","definition":"Reject amounts less than or equal to zero before calling the gateway.","aliases":[]},{"id":"contract:charge-call","type":"contract","label":"Charge call","definition":"Accept a request and gateway, return the gateway result, or raise ValueError for a nonpositive amount.","aliases":[]}],"claims":[{"id":"claim:positive-amount-guard","subject":"capability:charge-payment","relation":"constrained_by","object":"rule:positive-amount","statement":"The charge function rejects amounts <= 0 before invoking the gateway.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/payments.py","locator":"charge: amount guard before gateway.charge","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:charge-call-boundary","subject":"capability:charge-payment","relation":"exposes","object":"contract:charge-call","statement":"charge(request, gateway) returns gateway.charge(request.amount) or raises ValueError for a nonpositive amount.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/payments.py","locator":"charge: signature, raise, and return","snapshot":null}],"derived_from":[],"gap":null}]}
```

For another document owning the contract, reference `feature:payments#contract:charge-call` and add a document `references` edge to `feature:payments`; do not duplicate the entity. Test outcomes remain unknown until execution evidence is available.

## UNRESOLVED EXAMPLE

Illustrative unresolved proposal. Use real domain content when authoring; this example asserts no project facts.

```json
{"schema_version":1,"entities":[{"id":"rule:payment-idempotency","type":"rule","label":"Payment idempotency","definition":"The treatment of repeated payment requests sharing a key.","aliases":[]}],"claims":[{"id":"claim:deduplicate-payment","subject":"rule:payment-idempotency","relation":null,"object":null,"statement":"Proposed: repeated requests with the same key create at most one charge.","kind":"hypothesis","status":"unresolved","evidence":[],"derived_from":[],"gap":"An authorized requirement must establish key scope and retention period."}]}
```

## VALIDATION PROCEDURE

1. After regenerating `.graph.json`, run `python ./scripts/validate_ontology.py <target_docs_dir>` from the skill directory. For targeted work, append repeated `--document <node_id>` options. The script is read-only and uses only the Python standard library.
2. Resolve reported structural errors: JSON fields/version, IDs, reference resolution, relation endpoint types, statuses, and circular derivation. Unknown versions fail; never silently rewrite them. Documents without knowledge are reported as skipped, not semantically complete.
3. Inspect cited evidence, including locators and available snapshots. Check whether it establishes the statement's kind, conditions, and scope. Reclassify unsupported claims and preserve contradictory evidence.
4. Apply SEMANTIC COMPLETION GATE, including scoped coverage and unanswered questions. No structural validator can determine whether all material business concepts were extracted.
5. Check that prose and digest preserve uncertainty and distinguish intended behavior from observed behavior. Report which checks actually ran.

The ontology validator checks structure and references; the graph generator checks document routing. Neither inspects evidence contents, resolves external sources, proves factual correctness, or executes tests described by claims. Evidence and semantic coverage remain agent responsibilities.
