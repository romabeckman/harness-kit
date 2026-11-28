# Business documentation rules

Use this reference for `docs/business/**/*.md`. Business documentation describes the product and its business context. Architecture, implementation, and test strategy belong in their existing documents.

## Document catalog

Paths are relative to `docs/business/`. Create the required document within authorized scope.

ALLOWED: Within an authorized documentation update, create a suggested document without a separate request when you identify a new, evidence-backed business rule or decision that needs a dedicated document. Update the existing document if it already owns the topic. Create suggested documents only when they serve a concrete need and have enough evidence to be useful.

| Document | Status | Purpose |
|---|---|---|
| `intent.md` | Required | Records why the repository exists and which business outcomes its work should support. |
| `steering.md` | Suggested | Records the project's current direction, agreed priorities, and criteria for making trade-offs in support of the business intent. |
| `relations.md` | Suggested | Describes business relationships between projects within the same company or business and identifies their repositories. |
| `stakeholders.md` | Suggested | Identifies the people or groups affected by the product, their needs, and their decision responsibilities where known. |
| `business-rules.md` | Suggested | Records business policies, eligibility criteria, and exceptions that govern product decisions. |
| `success-metrics.md` | Suggested | Defines how progress toward the business objectives is measured, including targets and measurement methods where established. |

## Business relations

- REQUIRED: Focus on relationships between projects within the same company or business. Include a frontend, backend, or service when it is an internal project with a business role in the relationship. Describe each project's role and why the relationship matters. Record direction only when supported.
- REQUIRED: Identify the current project's repository and each related project's repository by name when confirmed. Use the owner or organization and repository name (for example, `company/customer-portal`) when available. Mark unknown repository names as unconfirmed.
- PROHIBITED: List software packages, libraries, or dependency manifests as project relationships. Record an external API or another third-party integration only when the user explicitly requests that specific relationship. Label it as external and explain its business relevance.
- REQUIRED: When `relations.md` exists, use it as the canonical narrative for business relationships. Reconcile its confirmed project links with the derived `related_projects` index under the [project relationship contract](INDEX-RULES.md#project-relationship-contract).

## Business intent

`intent.md` is the only mandatory business document. It records why the repository exists, the problem or opportunity it addresses where known, and the business outcomes its work is intended to support. It gives contributors and reviewers a common basis for defining scope, prioritizing work, and assessing whether a proposed change advances an objective. When the connection is unclear, use the document to surface the scope or trade-off that needs a decision.

Use the title `# Business Intent` and the shared template below. In `## PURPOSE`, state the repository's purpose. In `## CONTEXT`, describe the problem and audience where supported. Use `## BUSINESS OBJECTIVES` for intended outcomes and distinguish them from verified results. Add `## DECISION GUIDANCE` with practical review questions, such as which objective a proposed change serves or which trade-off it introduces. Use `## OPEN QUESTIONS` for material gaps, including unknown measures of success. Clearly label inferred objectives and keep them separate from binding requirements.

## Scope and creation

- REQUIRED: Create `docs/business/intent.md` when initializing or updating project memory within authorized scope.
- REQUIRED: Ground statements in an explicit user statement or inspected project evidence. For `## REFERENCES`, use only relative links to managed documents in `docs/adr/`, `docs/business/`, or `docs/feature/`, as defined in the [document contract](DOCUMENT-CONTRACT.md#presentation). Distinguish stated intent from inference and mark unknown goals or measures as unresolved; never invent stakeholders, metrics, approval, or strategy.
- REQUIRED: Keep every business document concise, precise, and focused on its purpose. State the relevant facts, decisions, and constraints directly. Use specific names and terms, and keep the qualifiers needed for accuracy. Omit filler, unnecessary narrative, repeated explanations, and background that does not inform a decision or help the reader understand the topic. Use short paragraphs, lists, or tables where they make the information easier to scan. Treat the character limit as a ceiling and use only the space the topic needs.
- ALLOWED: Add business document types as needs emerge. Extend the catalog with their purpose and status and retain the shared template. Give each business topic a clear owner and link to existing material when topics overlap.
- REQUIRED: Apply the 20,000-character whole-file limit after normalizing line endings. Remove repetition first; split by coherent business responsibility when authorized, preserving sources and links. If a needed split is out of scope, report it as unresolved.
- REQUIRED: Index existing business documents in `docs/.graph.json` as `business` nodes. Plain Markdown is sufficient. The generator derives the title and a `business:<slug>` ID when none is supplied. Optional YAML frontmatter may provide a stable `node_id`, `tags`, and explicit `edges` for supported relationships between indexed documents. Use target node IDs for those edges and ordinary Markdown links for prose references.
- PROHIBITED: Embedded graph blocks in business documents.

## Shared template

Use the same base for every business document. Give each document a title, purpose, one or more sections named for its topic, and references. Include context and open questions when useful or required by the document type. Choose the format that fits the content, such as a table for relationships, a list for objectives, or prose for scope. Replace all placeholders with grounded content or an explicit unresolved statement. Use English unless the user requests another language.

<output_template target="docs/business/**/*.md">

```markdown
# [Business topic]

## PURPOSE
[What this document records and which decisions it informs.]

## CONTEXT
[Relevant business background and boundaries. Omit when inapplicable.]

## [HEADING FOR THE BUSINESS TOPIC]
[Record the supported information. Repeat with additional descriptive headings when needed.]

## OPEN QUESTIONS
[Unresolved information that materially affects this topic; omit if none.]

## REFERENCES
- [Managed document and its relevance](relative/path/to/managed-document.md)
```

</output_template>
