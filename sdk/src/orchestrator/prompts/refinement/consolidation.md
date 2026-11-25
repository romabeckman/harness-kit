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
- Translate numeric question IDs to Q IDs with at least two digits, including
  additional manually supplied answers. Preserve the original question, suggestion,
  rationale, answer, author, and status. Keep setup answers outside the business
  question history and PBIs, and reserve their numeric IDs when assigning new Q IDs.
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

<refinement_evidence>
{{refinementEvidence}}
</refinement_evidence>
