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
# Protocolo de Testes

## OVERVIEW
[Testing philosophy, main frameworks, and overall quality goal — maximum 3 lines.]

## COMMANDS
| Tipo | Comando | Descrição |
|------|---------|-----------|
| Unitário | `[command]` | [What it runs] |
| Integração | `[command]` | [What it runs] |
| E2E | `[command]` | [What it runs] |
| Cobertura | `[command]` | [What it generates] |

## MINIMUM COVERAGE
REQUIRED: Maintain the following minimum coverage levels:

| Camada | Cobertura | Descrição |
|--------|-----------|-----------|
| Domínio / Core | [X]% | Lógica e invariantes de negócio |
| Aplicação / Use Cases | [X]% | Orquestração e fluxos |
| Infraestrutura / Adapters | [X]% | Integrações externas e persistência |
| Global | [X]% | Cobertura total média |

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
```

---

## LLM OPTIMIZATION RULES (MANDATORY)

- REQUIRED: Verify every command against the project's actual configuration (e.g., `package.json` scripts, `Makefile`) before writing.
- REQUIRED: Coverage levels must reflect actual CI gates — not aspirational values.
- PROHIBITED: Filler text — remove any sentence starting with "This section describes…" or "Below we can see…".
- PROHIBITED: Placeholder literals in the final file.
- REQUIRED: UPPERCASE section titles (`## COMMANDS`, `## TOOLING`, etc.) for reliable LLM context extraction.
