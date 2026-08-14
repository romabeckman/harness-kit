# Standard Document Template

Use this template for any `docs/feature/*.md` or `docs/adr/*.md` file that is not `README.md`, `ARCHITECTURE.md`, or `TESTS.md`. Adapt all content (languages, commands, tools) to the project's actual stack.

---

## RULES BEFORE WRITING

- REQUIRED: One document covers exactly **one** business domain, module, or architectural layer.
- PROHIBITED: Mixing unrelated topics in a single file.
- REQUIRED: Keep document compact, objective, and dense — strictly under **8,000 characters**.
- REQUIRED: For complementary ADRs extracted from `ARCHITECTURE.md` (e.g., `SECURITY.md`, `OBSERVABILITY.md`, `TELEMETRY.md`, `DATABASE.md`), ensure strict compliance with the 8,000 character limit and cross-reference back to `ARCHITECTURE.md`.
- REQUIRED: Cross-reference section at the end listing related `docs/` files.

---

## MANDATORY TEMPLATE

```markdown
---
doc_type: [feature or adr]
domain: [domain name]
stack: [list of relevant technologies]
node_id: "[type]:[slug]"
tags: [tag1, tag2]
edges:
  - relation: [implements | depends_on | tested_by | references | child_of]
    target: "[target_node_id]"
updated: YYYY-MM-DD
---
# [Document Title]
[One sentence stating the purpose of this document.]

```graph
{
  "node_id": "[type]:[slug]",
  "domain": "[domain name]",
  "implements": ["adr:architecture"],
  "tested_by": ["adr:tests"],
  "entrypoints": [
    "relative/path/to/public-entrypoint.ts"
  ],
  "registration_files": [
    "relative/path/to/registry-or-factory.ts"
  ],
  "reference_files": [
    "relative/path/to/representative-implementation.ts"
  ],
  "code_files": [
    "relative/path/to/source1.ts"
  ],
  "test_files": [
    "relative/path/to/test1.test.ts"
  ]
}
```

Use routing arrays by role:

- `entrypoints`: public or runtime entry files agents should inspect first.
- `registration_files`: registries, factories, dependency injection, exports, or command maps changed when extending the feature.
- `reference_files`: smallest representative implementations to copy as patterns.
- `code_files`: remaining production files defining the feature.
- `test_files`: tests proving feature behavior and integration.

REQUIRED: Use project-relative paths, remove duplicates across arrays, and list only files that exist.
REQUIRED: Use empty arrays when a routing role does not apply.
PROHIBITED: Copying these source paths into YAML `edges`, `.digest.md`, or `.graph.json`.
REQUIRED: For ADR documents, omit the entire embedded `graph` block; source routing belongs only to feature documents.

## OVERVIEW
[Context limited to 2–3 sentences. State the main concept in the context of the project stack. No introductory filler.]

## FOLDER STRUCTURE
[High-level architectural view: folders and layers only, not a file inventory. Show one representative entry per folder/layer — enough to convey the module's shape and where new code of each type belongs. PROHIBITED: enumerating every individual file already listed in the `code_files`/`test_files` arrays of the top ````graph` block — that duplicates content and wastes tokens. If a folder holds many similar files (e.g. multiple use cases, multiple adapters), collapse them into one annotated line (e.g. `use-cases/ # RunX, GetY, UpdateZ use cases`) instead of one line per file.]
<folder_structure>
```
src/module-name/
├── domain/                 # Core logic, invariants, domain-specific validations
├── application/
│   └── use-cases/          # Orchestration and business flows
└── infrastructure/
    └── adapters/            # Persistence or external integrations
```
</folder_structure>

## [MAIN CONCEPTS / COMPONENTS]
[Explain necessary concepts before "how-to". Omit this section if the reader needs no conceptual grounding.]

### [Concept 1]
- **[Key item]**: Description
- **[Other item]**: Description

## HOW TO [DO SOMETHING]
[Main practical section — focus on implementation, not theory.]

### Prerequisites
1. [Requirement 1, e.g., tool installed]
2. [Requirement 2, e.g., environment variable configured]

### Steps
1. [Step 1]
2. [Step 2]

<code_example>
# CORRECT: [Explanation of the correct pattern]
correct_code()

# WRONG: [Explanation of the anti-pattern]
wrong_code()
</code_example>

## PARAMETERS / CONFIGURATIONS
[Use a table if this section applies. Omit if there are no configurable parameters.]

| Name | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| param1 | string | Yes | Clear description | — |
| param2 | int | No | Description | 100 |

## BEST PRACTICES
REQUIRED: [Practice name] — [brief justification]
REQUIRED: [Practice name] — [brief justification]
FORBIDDEN: [Anti-pattern] — [brief justification]

## TIPS
[One actionable tip that saves time or avoids a common problem in this stack. Omit if there is nothing non-obvious to add.]

<code_tip>
// Practical example
optimized_code()
</code_tip>

<!-- Include ## DOCUMENT MAP with Mermaid graph TD ONLY when the document has 2+ edges.
     For single-edge documents, omit this section — ## REFERENCES already carries the relation. -->
## DOCUMENT MAP

```mermaid
graph TD
    THIS["[Document Title]"] -->|[relation]| REL1["[Related Doc Title]"]
    THIS -->|[relation]| REL2["[Related Doc Title]"]
    click REL1 "[relative/path/to/doc.md]"
    click REL2 "[relative/path/to/doc.md]"
```

## REFERENCES

- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md or ./ARCHITECTURE.md): [One-line description of the relationship]
- [**TESTS.md**](../adr/TESTS.md or ./TESTS.md): [One-line description of the relationship]
```

---

## CHANGE SUMMARY (when updating an existing document)

REQUIRED: After delivering updated content, provide a concise change summary in this format:

- **Added:** [what was added and why]
- **Updated:** [what changed and why]
- **Removed:** [what was removed and why]
