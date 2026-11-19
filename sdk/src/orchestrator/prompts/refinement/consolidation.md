<skill_context>
Invoke the `harness-kit:pbb-design` skill before starting.
Mode: autonomous consolidation using human-validated refinement evidence.
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
- Base every item strictly on scope and <refinement_evidence>.
- Human answers are authoritative. Recommendations remain supporting rationale.
- Trace every PBI to a functionality, persona, and problem or expectation.
- In Open Questions preserve question, suggested answer, rationale, resolved answer,
  answered-by value, and status from the evidence.
- Mark any model-derived statement as a Provisional model assumption.
- Do not include architecture or implementation details.
- If no decision-relevant gap remains, write "No open questions."
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
