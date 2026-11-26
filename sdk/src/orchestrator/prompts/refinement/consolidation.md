<skill_context>
Invoke the `harness-kit:pbb-design` skill before starting.
Mode: autonomous consolidation preserving the provenance of each refinement answer.
Produce the final PBB document at <output_file>.
</skill_context>

<objective>
Use Product Backlog Building (PBB) to transform the scope and refinement evidence
into business context for Bootstrap backlog generation and Planning.
</objective>

<output_file>
{{refinementPath}}
</output_file>

{{*orientationSection}}
<output_format>
Write the file with exactly this structure (Markdown):

# Product Backlog Building — Project Context

## 1. Product
## 2. Problems
## 3. Expectations
## 4. Personas
## 5. Functionalities
## 6. Product Backlog
## 7. Traceability
## 8. Assumptions
## 9. Open Questions

## Frontend Screens & Visualization
</output_format>

<rules>
- CRITICAL: Do not narrate progress or emit interim status updates. Use tools and internal reasoning normally. After completing all required work, return only the final output explicitly required by the current prompt. If no final output is required, return exactly {}.
- Invoke and follow the loaded pbb-design skill.
- Read the pbb-design references/output-contract.md when producing the final document.
- Use PBB-Contract: 2, the required record fields, IDs, typed references, enums,
  traceability, source catalogue, and publication checks in that contract.
- For `Priority status: proposed`, record the ordering inference as an `Axx`
  assumption or a provisional model `Qxx` decision. Cite that ID in
  `Priority reason`, include it in `Decision refs` and Traceability, and list the
  affected PBIs in `Affects`. Use the inference record's `Basis` to cite the
  evidence behind the recommendation. When there is insufficient evidence to
  propose an order, use `Priority status: pending` and `Delivery rank: null`,
  and state what evidence is missing in `Priority reason`.
- Translate numeric question IDs to Q IDs with at least two digits, including
  additional manually supplied answers. Preserve the original question, suggestion,
  rationale, answer, author, and status. Keep setup answers outside the business
  question history and PBIs. Reserve these numeric setup IDs when assigning new Q IDs: {{setupIds}}.
- Only entries in <refinement_evidence> provide human decisions or deferrals.
  Use the exact Q ID, answer, author, status and human statement when present.
  Mark any newly introduced question as a Provisional model assumption.
- In Suggested answer, Rationale, Resolved answer and Human statement, encode
  text with line breaks, leading or trailing whitespace, or a literal `json:"`
  prefix as `json:` followed by a JSON string (for example `json:"Line 1\nLine 2"`).
  Keep the encoded field on one Markdown source line and preserve every character.
- If <refinement_draft> is provided, revise it using the most recent correction
  in <refinement_evidence>. Keep stable IDs, link the correction with Supersedes
  when it replaces a decision, and update affected PBIs, priorities and traceability.
- If <refinement_validation_errors> is provided, fix each reported issue. Use
  <rejected_refinement_ref> when present and preserve valid records, IDs, and
  human evidence. Write the complete corrected document to <output_file>.
- Apply human answers even when they replace a suggestion. Preserve deferred and
  unknown answers as unresolved, including any humanStatement. An autonomous
  consolidation never changes existing human authorship or resolves deferrals.
- Mark only behavior dependent on a material unresolved rule as needing clarification.
  A pending or proposed priority alone does not prevent refining supported behavior.
- Base every item strictly on scope and <refinement_evidence>.
- Human answers are authoritative. Recommendations remain supporting rationale.
- Trace every PBI to a functionality, persona, and problem or expectation.
- In Open Questions preserve question, suggested answer, rationale, resolved answer,
  answered-by value, and status from the evidence.
- Mark any model-derived statement as a Provisional model assumption.
- Do not include architecture or implementation details.
- Use "No open questions." only if no question history exists.
- Treat Frontend Screens & Visualization as a complement to PBB, never as a replacement
  for problems, expectations, personas, functionalities, PBIs, or traceability.
</rules>

<optional_ui_prototype_analysis>
UI prototype analysis is optional. If a prototype, screen, frame, image, or link is available,
optionally invoke the `harness-kit:read-ui-prototype` skill and place its structural
screen description under `## Frontend Screens & Visualization`.
If no prototype, screen, frame, image, or link is available, skip the skill. Derive only
screen-level interactions supported by the scope, PBIs, and answers. If none exist, write
"None identified." Do not request a prototype or invent visual values or implementation details.
</optional_ui_prototype_analysis>

{{*scopeSection}}

{{*draftSection}}

{{*validationSection}}

<refinement_evidence>
{{refinementEvidence}}
</refinement_evidence>
