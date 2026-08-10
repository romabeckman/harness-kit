# Rules for docs/README.md

Defines strict rules for generating and maintaining `docs/README.md`.

> **Core principle:** `docs/README.md` is **exclusively a navigation index**. It does NOT contain technical explanations, architecture decisions, code examples, component descriptions, or any content that belongs in specialized documents. All technical content lives in the other files inside `docs/`.

---

## EXPECTED OUTPUT

| Field | Value |
|---|---|
| Target file | `docs/README.md` (root of the `docs/` folder) |
| Agent action | Generate or overwrite `docs/README.md` using the MANDATORY TEMPLATE exactly as specified. |
| When to update | REQUIRED: Every time a document is added, removed, or renamed in `docs/`, update `docs/README.md` in the same operation. |

---

## PROHIBITED CONTENT

REQUIRED: Reject any attempt to include the following content in this file.

| Prohibited content | Where it belongs |
|---|---|
| Architecture diagrams or design decisions | `docs/adr/ARCHITECTURE.md` |
| Code examples, snippets, or commands | The document specific to that topic |
| Explanations of layers, modules, or components | `docs/adr/ARCHITECTURE.md` |
| Test strategies or configurations | `docs/adr/TESTS.md` |
| Installation or environment setup guides | `docs/adr/SETUP.md` (if explicitly approved and it exists) |
| Business rules or domain flows | The document specific to that domain |
| More than 2 sentences per document description | — (exceeds the table limit) |

---

## STRUCTURE RULES

1. **Fixed sections:** REQUIRED: The document contains exactly three sections — introductory header, index table (`## Documentation Index`), and recommended reading order (`## Recommended Reading Order`). PROHIBITED: Any additional section.

2. **Introductory header:** Maximum 2 sentences. State only that this is a navigation index for the project documentation. PROHIBITED: Technical details.

3. **Index table:** Three fixed columns:
   - `Document`: filename with relative link (e.g., `[**ARCHITECTURE.md**](./adr/ARCHITECTURE.md)`).
   - `Description`: maximum **2 sentences**, purely objective — states *what the document is*, not *what it contains in detail*.
   - `Reading`: **`Mandatory`** (bold) for structural and architectural documents; `Optional` for specific guides.

4. **Recommended reading order:** Numbered list suggesting logical sequence:
   - **Exact path supplied**: Read that target directly; use indexes later only for synchronization or related-document discovery.
   - **.digest.md** first for fast AI agent orientation (stack, commands, constraints).
   - **.graph.json** second for macro document topology and 1-hop relation routing.
   - Foundational baseline ADRs next (Architecture, Tests).
   - Specific domain/feature documents after.

5. **Index updates:** REQUIRED: Add every new `docs/adr/` or `docs/feature/` document to the table. PROHIBITED: Removing entries unless the corresponding file has been deleted.

---

## MANDATORY TEMPLATE

REQUIRED: Use the exact structure below as literal output when generating or updating `docs/README.md`. Replace every `[placeholder]` with actual project content.

```markdown
# Project Documentation

Index of project technical documentation for **[Project/Service Name]**. Use the links below to navigate the available documents and graph map topology.

## Documentation Index

| Document | Description | Reading |
|----------|-------------|----------|
| [**.digest.md**](./.digest.md) | Fast-path machine-readable orientation digest (stack, test commands, rules). | **Mandatory** |
| [**.graph.json**](./.graph.json) | Macro relation graph index for agent topology navigation and 1-hop routing. | **Mandatory** |
| [**ARCHITECTURE.md**](./adr/ARCHITECTURE.md) | Architecture, folder organization, and code patterns for the project. | **Mandatory** |
| [**TESTS.md**](./adr/TESTS.md) | Testing strategies, patterns, and execution commands. | **Mandatory** |

## Recommended Reading Order

If an exact path is supplied, read it directly. Otherwise use this order:

1. **.digest.md** — fast AI orientation (architecture pattern, stack, test commands).
2. **.graph.json** — macro relation graph index for 1-hop document lookup.
3. Selected ADR or feature documents only when their design context is required.
```

> **Note:** The template above shows the minimum expected documents. Add new rows to the table and the reading list to reflect the actual documents present in `docs/`.
