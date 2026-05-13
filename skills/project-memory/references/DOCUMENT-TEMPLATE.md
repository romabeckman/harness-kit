# Standard Document Template

Always structure new documents or sections using the format below, adapting content (languages, commands, and tools) to the project's reality:

```markdown
# [Document Title]
[One-line description explaining the purpose of the document]

## OVERVIEW
[Quick and objective context. Maximum 2-3 paragraphs explaining the main concept in the context of the project stack.]

## FOLDER STRUCTURE
[Simplified folder structure showing only relevant files for this context/module. Use names that represent the business role of the file without technical extensions.]
```text
src/module-name/
├── domain/
│   ├── business-entity    # Logic and core rules
│   └── business-validator # Specific validations
├── application/
│   └── business-flow      # Orchestration and use cases
└── infrastructure/
    └── external-adapter   # Persistence or external calls
```

## [MAIN CONCEPTS/COMPONENTS]
[If applicable, explain necessary concepts before "how-to"]

### [Concept 1]
* **[Important Item]**: Description
* **[Other Item]**: Description

## HOW TO [DO SOMETHING] / HOW IT WORKS
[Main practical section - focus on implementation]

### Prerequisites
1. [Requirement 1, e.g., Tool installed]
2. [Requirement 2, e.g., Environment variable configured]

### Implementation Overview / Steps
[Describe the implementation steps and logic. Avoid large code blocks; use clear descriptions of the business process. If a code snippet is absolutely necessary for clarity, limit it to a single line.]

```[project_language]
// Single line example if strictly necessary
relevantCodeSnippet()
```

### How [Specific Aspect] Works
1. [Step 1 of the process]
2. [Step 2 of the process]

## PARAMETERS / CONFIGURATIONS / OPTIONS
[If applicable, use a table to list function parameters, environment configs, or CLI options]

| Name | Type | Required | Description | Default |
| --- | --- | --- | --- | --- |
| param1 | string | Yes | Clear description | - |
| param2 | int | No | Description | 100 |

## BEST PRACTICES
[List of recommended practices based on the project stack]

* **[Main Action]** [explanation].
* **[Main Action]** [explanation]. [Additional context].

```[project_language]
// CORRECT: [Explanation of the correct pattern]
correct_code()

// WRONG: [Explanation of common error]
wrong_code()  // [Comment about the problem]
```

## 💡 TIPS
[Valuable practical tip that saves time or avoids common problems in the framework/language used]

```[project_language]
// Practical example of the tip
optimized_code()
```

[Explanation of benefit]

---

**Summary of Changes** [Only when presenting changes to existing docs to the user]

* ✅ [Action taken]: [file or section]
```
