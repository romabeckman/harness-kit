# Rules for docs/adr/ARCHITECTURE.md

Defines the analysis framework and strict rules for generating and maintaining `docs/adr/ARCHITECTURE.md`.

---

## EXPECTED OUTPUT

| Field | Value |
|---|---|
| Target file | `docs/adr/ARCHITECTURE.md` |
| Max size | 8,000 characters (strictly enforced) |
| Content style | Compact, dense, and objective — no lengthy narrative explanations or verbose prose |
| Agent action | Read the repository, apply the PRE-GENERATION ANALYSIS below, then generate or overwrite the file using the MANDATORY TEMPLATE exactly as specified |

---

## SIZE LIMIT & DECOMPOSITION RULES

- REQUIRED: Keep `docs/adr/ARCHITECTURE.md` strictly under **8,000 characters**.
- REQUIRED: Text must be compact, objective, and dense. PROHIBITED: Long theoretical explanations, conversational filler, or verbose historical context.
- When `docs/adr/ARCHITECTURE.md` approaches or reaches the 8,000-character limit, apply one or both of the following pathways:
  1. **Text Compacting:** Condense prose into concise bullet points, replace narrative with compact tables, and remove redundant explanations while preserving strict technical constraints.
  2. **Decomposition into Complementary ADRs (`docs/adr/`):** Split deep or specialized architectural domains into separate complementary ADR documents inside `docs/adr/` (e.g., `docs/adr/SECURITY.md`, `docs/adr/OBSERVABILITY.md`, `docs/adr/TELEMETRY.md`, `docs/adr/DATABASE.md`, `docs/adr/API-DESIGN.md`).
     - REQUIRED: Each complementary ADR document must also strictly observe the **8,000 character limit** and follow `./DOCUMENT-TEMPLATE.md`.
     - REQUIRED: Retain only a high-level summary or reference row in `docs/adr/ARCHITECTURE.md` and register the edge in frontmatter (`edges: [{relation: references, target: "adr:<slug>"}]`) and `## REFERENCES`.

---

## PRE-GENERATION ANALYSIS

REQUIRED: Complete all three analyses by inspecting the repository before writing a single line of the document. Each analysis maps directly to a template section.

| Analysis item | Where to look | Feeds template section |
|---|---|---|
| Structure | Application root directory (e.g., `src/`, `app/`), organization by feature vs layer, global configs | `## FOLDER STRUCTURE` |
| Patterns | Class/function definitions, naming conventions, DI, error handling, REQUIRED/FORBIDDEN constraints | `## LAYERS` and `## PATTERNS` |
| Integrations | Registration logic (routes, services), external calls (DBs, APIs) | `## INTEGRATIONS` |

---

## MANDATORY TEMPLATE

REQUIRED: Use the exact structure below as literal output when generating or updating `docs/adr/ARCHITECTURE.md`. UPPERCASE section titles are mandatory and must not be renamed or removed.

```markdown
---
doc_type: adr
domain: architecture
stack: [list of main technologies]
node_id: "adr:architecture"
tags: [architecture, design-patterns, folder-structure]
edges:
  - relation: references
    target: "adr:tests"
updated: YYYY-MM-DD
---
# Project Architecture

## OVERVIEW
[Maximum 3 lines. State the main architectural pattern (e.g., Clean Architecture, Hexagonal, MVC), primary languages/frameworks, and the general data flow.]

## FOLDER STRUCTURE
[Directory tree from Structure Analysis. Show the most important structural folders. Use aligned comments to explain the purpose of each. Do not list every file — focus on the root structure of features/domains.]
<folder_structure>
```
[project_root]/
├── [config_folder]/              # [Purpose, e.g., Environment configuration]
├── [features_folder]/            # [Purpose, e.g., Business domain modules]
│   └── [domain_example]/
│       ├── [layer_1]/            # [Layer responsibility within this domain]
│       └── [layer_2]/            # [Layer responsibility within this domain]
└── [shared_folder]/              # [Purpose, e.g., Generic utils and helpers]
```
</folder_structure>

## LAYERS
[List main architectural layers and their strict responsibilities.]
- **[Layer 1]**: [Responsibility and constraints of this layer]
- **[Layer 2]**: [Responsibility and constraints of this layer]

## MODULES
| Module | Responsibility | Location |
|--------|-----------------|-------------|
| [Name] | [What it does]  | `[path]/`   |

## PATTERNS
[Code rules from Pattern Recognition. Use REQUIRED and FORBIDDEN prefixes.]

<code_patterns>
# REQUIRED: [Pattern name — e.g., Constructor dependency injection]
[Code example demonstrating the correct pattern]

# FORBIDDEN: [Anti-pattern name — e.g., Global state usage]
[Code example demonstrating what NOT to do]
</code_patterns>

## INTEGRATIONS
| External Service / Component | Purpose | Connection / Authentication Method |
|------------------------------|---------|-------------------------------------|
| [Name]                       | [Use]   | [How it connects]                   |

<!-- DOCUMENT MAP: omitted — this baseline ADR has exactly 1 edge. The ## REFERENCES section below carries the relation. Include ## DOCUMENT MAP with Mermaid graph TD only when 2+ edges exist. -->

## REFERENCES

- [**README.md**](../README.md): Main documentation index.
- [**TESTS.md**](./TESTS.md): Testing strategies and commands.
```

---

## LLM OPTIMIZATION RULES (MANDATORY)

- REQUIRED: Keep document length strictly under 8,000 characters. If approaching the limit, compact prose or decompose into complementary `docs/adr/*.md` documents.
- REQUIRED: Use tables for `## MODULES` and `## INTEGRATIONS` — never prose paragraphs for relational data.
- REQUIRED: Annotate every directory in `## FOLDER STRUCTURE` with a `#` comment explaining where new files of each type should be created.
