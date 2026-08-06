# Rules for docs/adr/TESTS.md

Defines the analysis framework and strict rules for generating and maintaining `docs/adr/TESTS.md`.

---

## EXPECTED OUTPUT

| Field | Value |
|---|---|
| Target file | `docs/adr/TESTS.md` |
| Agent action | Analyze the repository, apply the PRE-GENERATION ANALYSIS below, then generate or overwrite the file using the MANDATORY TEMPLATE exactly as specified |

---

## PRE-GENERATION ANALYSIS

REQUIRED: Answer every item below by inspecting the repository before writing a single line of the document. Each item maps directly to a template section.

| Analysis item | Where to look | Feeds template section |
|---|---|---|
| Test framework | `package.json`, `pyproject.toml`, `go.mod`, CI config | `## TOOLING` |
| Test types present | Test file naming, folder structure (`unit/`, `e2e/`, etc.) | `## COMMANDS` |
| Run commands | `package.json` scripts, `Makefile`, CI pipeline | `## COMMANDS` |
| Coverage tool and thresholds | Coverage config files, CI gates | `## MINIMUM COVERAGE` |
| Mocking strategy | Test files, mock folders, MSW config | `## PATTERNS & BEST PRACTICES` |
| Known flaky or debug procedures | CI logs, test helper files | `## TROUBLESHOOTING` |

PROHIBITED: Inventing commands or coverage thresholds not found in the repository. Use only verified values.

---

## MANDATORY TEMPLATE

REQUIRED: Use the exact structure below as literal output when generating or updating `docs/adr/TESTS.md`. Replace every `[placeholder]` with actual project content — **never leave placeholder literals in the final file.**

```markdown
---
doc_type: adr
domain: testing
stack: [list of testing frameworks]
node_id: "adr:tests"
tags: [testing, unit-tests, e2e-tests, coverage]
edges:
  - relation: references
    target: "adr:architecture"
updated: YYYY-MM-DD
---
# Testing Protocol

## OVERVIEW
[Testing philosophy, main frameworks, and overall quality goal — maximum 3 lines.]

## COMMANDS
| Type | Command | Description |
|------|---------|-------------|
| Unit | `[command]` | [What it runs] |
| Integration | `[command]` | [What it runs] |
| E2E | `[command]` | [What it runs] |
| Coverage | `[command]` | [What it generates] |

## MINIMUM COVERAGE
REQUIRED: Maintain the following minimum coverage levels:

| Layer | Coverage | Description |
|-------|----------|-------------|
| Domain / Core | [X]% | Business logic and invariants |
| Application / Use Cases | [X]% | Orchestration and flows |
| Infrastructure / Adapters | [X]% | External integrations and persistence |
| Global | [X]% | Average total coverage |

## PATTERNS & BEST PRACTICES
REQUIRED: [e.g., AAA (Arrange, Act, Assert) — one assertion per test]
REQUIRED: [e.g., Mock only external boundaries, never internal domain logic]
FORBIDDEN: [e.g., Business logic inside test setup methods]
FORBIDDEN: [e.g., Tests that depend on execution order]

## TOOLING
- **Framework:** [Name and version]
- **Assertions:** [Name]
- **Mocks/Stubs:** [Name]
- **Coverage:** [Tool name and report format]
- **CI Integration:** [How tests run in the pipeline]

## TROUBLESHOOTING
- **Flaky tests:** [How to identify and report]
- **Debug mode:** [Command or flag to run tests with verbose/debug output]

<!-- DOCUMENT MAP: omitted — this baseline ADR has exactly 1 edge. The ## REFERENCES section below carries the relation. Include ## DOCUMENT MAP with Mermaid graph TD only when 2+ edges exist. -->

## REFERENCES

- [**README.md**](../README.md): Main documentation index.
- [**ARCHITECTURE.md**](./ARCHITECTURE.md): System architecture and patterns.
```

---

## LLM OPTIMIZATION RULES (MANDATORY)

- REQUIRED: Verify every command against the project's actual configuration (e.g., `package.json` scripts, `Makefile`) before writing.
- REQUIRED: Coverage levels must reflect actual CI gates — not aspirational values.
