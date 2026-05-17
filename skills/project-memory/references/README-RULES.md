# Rules for docs/README.md

Defines strict rules for generating and maintaining `docs/README.md`.

> **Core principle:** `docs/README.md` is **exclusively a navigation index**. It does NOT contain technical explanations, architecture decisions, code examples, component descriptions, or any content that belongs in specialized documents. All technical content lives in the other files inside `docs/`.

---

## EXPECTED OUTPUT

| Field | Value |
|---|---|
| Target file | `docs/README.md` (root of the `docs/` folder) |
| Output language | **Portuguese (pt-BR)** — no exceptions |
| Agent action | Generate or overwrite `docs/README.md` using the MANDATORY TEMPLATE exactly as specified. Replace every placeholder — **never leave placeholder literals in the final file.** |
| When to update | REQUIRED: Every time a document is added, removed, or renamed in `docs/`, update `docs/README.md` in the same operation. |

---

## PROHIBITED CONTENT

REQUIRED: Reject any attempt to include the following content in this file.

| Prohibited content | Where it belongs |
|---|---|
| Architecture diagrams or design decisions | `docs/ARCHITECTURE.md` |
| Code examples, snippets, or commands | The document specific to that topic |
| Explanations of layers, modules, or components | `docs/ARCHITECTURE.md` |
| Test strategies or configurations | `docs/TESTS.md` |
| Installation or environment setup guides | `docs/SETUP.md` (if it exists) |
| Business rules or domain flows | The document specific to that domain |
| More than 2 sentences per document description | — (exceeds the table limit) |

---

## STRUCTURE RULES

1. **Fixed sections:** REQUIRED: The document contains exactly three sections — introductory header, index table (`## Índice de Documentação`), and recommended reading order (`## Ordem de Leitura Recomendada`). PROHIBITED: Any additional section.

2. **Introductory header:** Maximum 2 sentences. State only that this is a navigation index for the project documentation. PROHIBITED: Technical details.

3. **Index table:** Three fixed columns:
   - `Documento`: filename with relative link (e.g., `[**ARCHITECTURE.md**](./ARCHITECTURE.md)`).
   - `Descrição`: maximum **2 sentences**, purely objective — states *what the document is*, not *what it contains in detail*.
   - `Leitura`: **`Obrigatória`** (bold) for structural and architectural documents; `Opcional` for specific guides.

4. **Recommended reading order:** Numbered list suggesting logical sequence:
   - Foundational documents first (Architecture, Organization).
   - Rules/domain documents next.
   - Process/test documents after.
   - Auxiliary tools and guides last.

5. **Index updates:** REQUIRED: Add every new `docs/` document to the table. PROHIBITED: Removing entries unless the corresponding file has been deleted.

---

## MANDATORY TEMPLATE

REQUIRED: Use the exact structure below as literal output when generating or updating `docs/README.md`. Replace every `[placeholder]` with actual project content.

```markdown
# Documentação do Projeto

Índice da documentação técnica do projeto **[Nome do Projeto/Serviço]**. Utilize os links abaixo para navegar pelos documentos disponíveis.

## Índice de Documentação

| Documento | Descrição | Leitura |
|-----------|-----------|---------|
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | Arquitetura, organização de pastas e padrões de código do projeto. | **Obrigatória** |
| [**TESTS.md**](./TESTS.md) | Estratégias de teste, padrões e comandos de execução. | **Obrigatória** |

## Ordem de Leitura Recomendada

1. **ARCHITECTURE.md** — fundação técnica e organização do projeto.
2. **TESTS.md** — validação e qualidade do código.
3. Demais documentos conforme a necessidade da tarefa.
```

> **Note:** The template above shows the minimum expected documents. Add new rows to the table and the reading list to reflect the actual documents present in `docs/`.