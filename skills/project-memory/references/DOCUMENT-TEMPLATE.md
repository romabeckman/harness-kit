# Standard Document Template

Use this template for any `docs/feature/*.md` or `docs/adr/*.md` file that is not `README.md`, `ARCHITECTURE.md`, or `TESTS.md`. Adapt all content (languages, commands, tools) to the project's actual stack.

---

## RULES BEFORE WRITING

- REQUIRED: One document covers exactly **one** business domain, module, or architectural layer.
- PROHIBITED: Mixing unrelated topics in a single file.
- PROHIBITED: Leaving placeholder literals (`[like this]`) in the final file.
- PROHIBITED: Emoji in section titles or body text.
- REQUIRED: UPPERCASE section titles for reliable LLM context extraction.
- REQUIRED: Cross-reference section at the end listing related `docs/` files.

---

## MANDATORY TEMPLATE

```markdown
# [Document Title]
[One sentence stating the purpose of this document.]

## OVERVIEW
[Context limited to 2–3 sentences. State the main concept in the context of the project stack. No introductory filler.]

## FOLDER STRUCTURE
[Show only the files and folders directly relevant to this module. Use aligned comments to explain the business role of each entry.]
<folder_structure>
src/module-name/
├── domain/
│   ├── business-entity     # Core logic and invariants
│   └── business-validator  # Domain-specific validations
├── application/
│   └── business-flow       # Orchestration and use cases
└── infrastructure/
    └── external-adapter    # Persistence or external integrations
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
