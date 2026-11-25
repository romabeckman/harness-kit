# PBB Markdown Output Contract

## Structure

Produce one Markdown document with the nine headings below in order.

1. `## 1. Product`
2. `## 2. Problems`
3. `## 3. Expectations`
4. `## 4. Personas`
5. `## 5. Functionalities`
6. `## 6. Product Backlog`
7. `## 7. Traceability`
8. `## 8. Assumptions`
9. `## 9. Open Questions`

The first section contains the literal line `PBB-Contract: 2`. Use
`### ID — Title` for records and the English field labels below. Write
descriptive values in the language of the scope.

Read fields from the Markdown source, one field per line. The first colon
after the label separates it from the value. Later punctuation belongs to the
value. When reading, accept a plain label, `**Label:**`, or `**Label**:`.

Use `null` for an unknown scalar and `[]` for an empty relationship. Keep
required fields present. Write lists of IDs as `[ID, ID]`. IDs use the section's
prefix and a positive number padded to at least two digits. IDs are unique
within a document. Preserve them across revisions and retain document
identity when combining products. When splitting a PBI, give each successor a
new ID, set `Origin` to the retired PBI ID, and update live references before
publishing. Reserve retired IDs. `Origin` is historical.

## Records and fields

| Section | Required content |
| --- | --- |
| Product | Marker and fields `Intent`, `In scope`, `Boundaries`, `Sources`. Under `Sources:` list entries as `- S01 — Recoverable location`, such as a PRD heading, identifiable text in the supplied scope, or a path and heading. Include the supporting excerpt in the source entry if it cannot be reopened. Use `Sources: []` if empty. |
| Problems | `PR01…`. Describe the concrete current difficulty in the title. Field `Basis`. |
| Expectations | `EX01…`. State the observable change in the title. Fields `Problems`, `Basis`. |
| Personas | `PE01…`. Name the role in the title. Fields `Current activity`, `Desired activity`, `Problems`, `Expectations`, `Basis`. |
| Functionalities | `FN01…`. Name the persona's action in the title. Fields `Personas`, `Problems`, `Expectations`, `Benefit`, `Basis`. |
| Product Backlog | `PBI01…`. Use the PBI fields below. |
| Traceability | One row per PBI with columns `PBI`, `Functionality`, `Persona`, `Problem`, `Expectation`, `Decisions`. Derive cells from the PBI fields. Separate multiple IDs with commas, keep `null` for unknown primary IDs, and use `[]` for an empty decision list. |
| Assumptions | `A01…`. Fields `Statement`, `Basis`, `Affects`, `Validation`. Use `[]` as the section body if empty. If a question already records the hypothesis, reference its `Qxx` directly. An assumption that relies on a question links to it in `Basis`. |
| Open Questions | `Q01…`. Put the question in the title and use the question fields below. Keep answered questions in this section. Use `No open questions.` only when there is no question history. |

`Basis` is a list of source, question, or assumption IDs that support the
specific claim in the record. Cite evidence that establishes the claim.
A requirement appearing in a list only establishes commercial order if the
source says the list is prioritized. Use the available evidence for each
claim and preserve the uncertainty of claims without evidence.

### PBI fields

| Field | Value |
| --- | --- |
| `Functionality`, `Persona` | One existing ID each. |
| `Problem`, `Expectation` | One primary ID each, or `null` when discovery could not establish it. Optional `Additional problems` and `Additional expectations` list further IDs. Include those IDs after the primary ones in the index. |
| `Outcome` | Observable business result or action the persona can perform. Qualify the part dependent on an unresolved rule. |
| `Benefit` | The specific benefit enabled by the PBI. Use its `FNxx` ID if the functionality has a single unambiguous benefit. |
| `Journey step` | Positive integer in the functionality's usage sequence, or `null`. When the functionality has multiple journeys, give the relevant journey name in the optional `Journey` field. |
| `Delivery rank` | Positive integer comparable within this document, or `null`. Gaps and justified ties are valid. |
| `Priority status` | `confirmed` for a positive rank established by explicit evidence or a human decision, `proposed` for a positive rank inferred from evidence, or `pending` for rank `null`. |
| `Priority reason` | One sentence citing the IDs supporting the order or inference, justifying a tie, or identifying the evidence missing for a pending order. |
| `Basis` | IDs that establish the item's behavior. Its commercial order has its own evidence in `Priority reason`. |
| `Decision refs` | Effective `Qxx` and `Axx` IDs affecting behavior or priority, including material decisions inherited from its functionality. Use `[]` when empty. |
| `Refinement state` | `ready_for_refinement` when the functional scope can be refined, including when only commercial priority is unresolved. Use `needs_clarification` when a material decision controls the core behavior. |
| `Next action` | What to refine now or which decision to obtain, including its ID when available. |

### Question fields

Each question has `Suggested answer`, `Rationale`, `Resolved answer`,
`Answered by`, `Status`, `Affects`, and `Impact`. `Affects` lists the
IDs whose current behavior, boundaries, benefit, or priority depend on the
decision. Include affected PBIs. `Impact` names the specific part of the
business scope affected. Use optional `Basis` to link evidence, including both
sources when there is a conflict.

| Event | `Answered by` | `Status` | `Resolved answer` |
| --- | --- | --- | --- |
| Human accepts or replaces the suggestion | `human` | `Human validated` | Preserve the original human answer. For acceptance, capture the accepted rule and use `Human statement` for the original wording if it differs. |
| Model suggests a grounded answer for a new gap | `model` | `Provisional model assumption` | The provisional suggested answer. |
| Human defers the decision | `unresolved` | `Deferred` | `Unresolved` |
| Human says they do not know, or no answer can be grounded | `unresolved` | `Unknown` | `Unresolved` |

Keep the original suggestion and rationale. Use `Suggested answer: null` if
there is no grounded suggestion and explain the gap in `Rationale`. Preserve
any original deferral or expression of uncertainty in `Human statement`.
The mode of a new invocation has no effect on existing answer provenance.
When a new decision replaces an earlier recorded decision, use
`Supersedes` with the earlier `Qxx` IDs, preserve their history, and update
`Affects` and `Decision refs` to reflect the current effects.

## Publication checks

- Verify headings, marker, required fields, unique IDs, typed references,
  and consistent rank, answer, and refinement states. Resolve each live
  reference or identify the missing ID before publishing.
- Check that the index agrees with every PBI block and that `Affects` agrees
  with each affected PBI's `Decision refs`. Include material inherited
  decisions when expanding the links. Keep supported behavior available
  when a different item is pending.
- Verify the provenance of each material behavior or ordering claim. Treat
  an explicit human decision as authoritative for the affected behavior.
  Preserve conflicting source references and unresolved parts.

## Reading a feature

1. Use the index to locate the feature's PBIs and read their functionality,
   persona, problem, and expectation records.
2. Follow `Basis` on the selected records and expand their `Decision refs`,
   including inherited questions and assumptions that affect these PBIs.
   In a handoff, include applicable decisions with answers, authors, status,
   and impact. Include supporting excerpts when the recipient cannot open
   the original sources.
3. Read rank with its priority status. Explain any tradeoff between commercial
   order and operational dependencies in planning. Operational priority levels
   require their own reasoning.
4. Refine supported outcomes and identify the PBI and question for each
   material pending behavior. When a decision changes, revisit affected
   records and relative ranks. For legacy documents without the marker, use
   the existing section headings and preserve unknowns.

## Example

```markdown
## 1. Product
PBB-Contract: 2
Intent: Help learners find courses suited to their experience.
In scope: Show the available level in the list and filter results by level.
Boundaries: The first release covers courses that already have a level. The filter's treatment of courses without a level remains open.
Sources:
- S01 — Supplied scope, first release: “Today learners open course pages one by one to check the level. In the first release, show the available level in the list for courses that already have one.”
- S02 — Supplied scope, filter: “Learners should be able to narrow results by level. We will decide how the filter treats courses without a level.”

## 2. Problems
### PR01 — Checking levels requires opening several course pages
Basis: [S01]

## 3. Expectations
### EX01 — Identify suitable courses while browsing the catalogue
Problems: [PR01]
Basis: [S01, S02]

## 4. Personas
### PE01 — Learner choosing a course
Current activity: Opens each course page to check the level.
Desired activity: Identifies suitable courses in the list.
Problems: [PR01]
Expectations: [EX01]
Basis: [S01, S02]

## 5. Functionalities
### FN01 — Browse courses by level
Personas: [PE01]
Problems: [PR01]
Expectations: [EX01]
Benefit: Choose suitable courses with fewer individual page visits.
Basis: [S01, S02]

## 6. Product Backlog
### PBI01 — See available course levels in the list
Functionality: FN01
Persona: PE01
Problem: PR01
Expectation: EX01
Outcome: The learner sees the level in the list for each course that has one.
Benefit: FN01
Journey step: 1
Delivery rank: 1
Priority status: confirmed
Priority reason: S01 and Q01 establish showing levels as the first release.
Basis: [S01]
Decision refs: [Q01]
Refinement state: ready_for_refinement
Next action: Refine how to show the levels of courses that already have one.

### PBI02 — Narrow results to a selected level
Functionality: FN01
Persona: PE01
Problem: PR01
Expectation: EX01
Outcome: The learner can browse results for the selected level. Q02 determines how the filter handles courses without a level.
Benefit: FN01
Journey step: 2
Delivery rank: 2
Priority status: confirmed
Priority reason: The decision maker placed filtering after showing levels in Q01.
Basis: [S02]
Decision refs: [Q01, Q02]
Refinement state: needs_clarification
Next action: Clarify Q02 before specifying the complete filter result.

## 7. Traceability
| PBI | Functionality | Persona | Problem | Expectation | Decisions |
|---|---|---|---|---|---|
| PBI01 | FN01 | PE01 | PR01 | EX01 | Q01 |
| PBI02 | FN01 | PE01 | PR01 | EX01 | Q01, Q02 |

## 8. Assumptions
[]

## 9. Open Questions
### Q01 — Which capability should ship first?
Suggested answer: Show levels in the list before offering the filter.
Rationale: S01 identifies what the first release should include.
Resolved answer: Show levels in the list first, then add the filter.
Answered by: human
Status: Human validated
Affects: [PBI01, PBI02]
Impact: Sets the commercial order of the two items.

### Q02 — How should the filter handle courses without a level?
Suggested answer: Include only courses with the selected level.
Rationale: This is the narrowest interpretation of filtering by level in S02.
Resolved answer: Unresolved
Answered by: unresolved
Status: Deferred
Human statement: We will decide that with the catalogue team later.
Affects: [PBI02]
Impact: The full set of filter results remains undetermined.
```
