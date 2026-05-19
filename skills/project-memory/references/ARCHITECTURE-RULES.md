# Rules for docs/adr/ARCHITECTURE.md

Defines the analysis framework and strict rules for generating and maintaining `docs/adr/ARCHITECTURE.md`.

---

## EXPECTED OUTPUT

| Field | Value |
|---|---|
| Target file | `docs/adr/ARCHITECTURE.md` |
| Agent action | Read the repository, apply the PRE-GENERATION ANALYSIS below, then generate or overwrite the file using the MANDATORY TEMPLATE exactly as specified |

---

## PRE-GENERATION ANALYSIS

REQUIRED: Complete all three analyses before writing a single line of the document. Each analysis maps directly to a template section.

### 1. Structure Analysis → feeds `## FOLDER STRUCTURE`

Answer these questions by inspecting directories and file organization:

- What is the application root directory? (e.g., `src/`, `app/`)
- Are files organized by feature/domain (e.g., `src/users/`) or by technical layer (e.g., `src/controllers/`)?
- Where do global configuration files and shared utilities live?

REQUIRED: Represent findings as an annotated directory tree in `## FOLDER STRUCTURE`.

### 2. Pattern Recognition → feeds `## LAYERS` and `## PATTERNS`

Answer these questions by reading class/function definitions and existing conventions:

- What naming conventions apply to classes and functions?
- What are the dependency injection and error handling patterns?
- What is strictly REQUIRED and what is FORBIDDEN in the codebase?

REQUIRED: Fill `## LAYERS` (responsibilities) and `## PATTERNS` (code blocks with REQUIRED/FORBIDDEN labels).

### 3. Integration Points → feeds `## INTEGRATIONS`

Answer these questions by inspecting registration logic and external calls:

- How are new components (routes, services) registered?
- Which external services does the project communicate with? (databases, external APIs)

REQUIRED: Map findings into the `## INTEGRATIONS` table.

---

## MANDATORY TEMPLATE

REQUIRED: Use the exact structure below as literal output when generating or updating `docs/adr/ARCHITECTURE.md`. UPPERCASE section titles are mandatory and must not be renamed or removed.

```markdown
# Arquitetura do Projeto

## OVERVIEW
[Maximum 3 lines. State the main architectural pattern (e.g., Clean Architecture, Hexagonal, MVC), primary languages/frameworks, and the general data flow.]

## FOLDER STRUCTURE
[Directory tree from Structure Analysis. Show the most important structural folders. Use aligned comments to explain the purpose of each. Do not list every file — focus on the root structure of features/domains.]
<folder_structure>
[project_root]/
├── [config_folder]/              # [Purpose, e.g., Environment configuration]
├── [features_folder]/            # [Purpose, e.g., Business domain modules]
│   └── [domain_example]/
│       ├── [layer_1]/            # [Layer responsibility within this domain]
│       └── [layer_2]/            # [Layer responsibility within this domain]
└── [shared_folder]/              # [Purpose, e.g., Generic utils and helpers]
</folder_structure>

## LAYERS
[List main architectural layers and their strict responsibilities.]
- **[Layer 1]**: [Responsibility and constraints of this layer]
- **[Layer 2]**: [Responsibility and constraints of this layer]

## MODULES
| Módulo | Responsabilidade | Localização |
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

## REFERÊNCIAS
- [**README.md**](../README.md): Índice principal de documentação.
- [**TESTS.md**](./TESTS.md): Estratégias e comandos de teste.
```

---

## LLM OPTIMIZATION RULES (MANDATORY)

- REQUIRED: Keep section titles UPPERCASE (`## OVERVIEW`, `## FOLDER STRUCTURE`, etc.) to enable reliable context extraction by other LLMs.
- REQUIRED: Prefix all architectural constraints with `REQUIRED:`, `FORBIDDEN:`, or `ALLOWED:` — no implicit rules.
- REQUIRED: Use tables for `## MODULES` and `## INTEGRATIONS` — never prose paragraphs for relational data.
- REQUIRED: Annotate every directory in `## FOLDER STRUCTURE` with a `#` comment explaining where new files of each type should be created.
- PROHIBITED: Filler text — remove any sentence starting with "This section describes…" or "Below we can see…".
- PROHIBITED: Placeholder literals in the final file — replace every `[placeholder]` with actual project content.