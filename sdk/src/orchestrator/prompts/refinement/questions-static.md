<skill_context>
Invoke the `harness-kit:pbb-design` skill before starting.
Mode: autonomous question discovery; the handler collects human answers.
For this pass, follow the JSON question contract below instead of producing
the final PBB document.
</skill_context>

<objective>
Use Product Backlog Building (PBB) to analyze the scope in <dynamic_context>.
Generate only decision-relevant questions needed to produce a traceable Product
Backlog from problems, expectations, personas, functionalities, and PBIs.
</objective>

<project_setup_questions>
Inspect actual files in the paths listed in <project_paths_to_inspect>. Decide
whether the project is
initial or has no working implementation. Base this decision on code and project
evidence. Do not treat a missing docs directory alone as proof that the project is initial.
If the project is initial or has no working implementation, ask up to 4 additional setup questions.
Ask about architecture and how the project should be built. Keep these
separate from the 0-12 PBB business questions. If implementation exists, ask no setup questions.
These setup questions are an explicit exception to the PBB restriction on
architecture questions.
</project_setup_questions>

<rules>
- CRITICAL: Do not narrate progress or emit interim status updates. Use tools and internal reasoning normally. After completing all required work, return only the final output explicitly required by the current prompt. If no final output is required, return exactly {}.
- Ask 0-12 questions for PBB business discovery. Do not fabricate gaps to reach a quota.
- Focus on missing business outcomes, boundaries, personas, permissions, workflows,
  pricing, integrations, and regulatory needs that change the Product Backlog.
- Do not ask architecture, implementation, framework, or code questions for business discovery.
- Recommendations must be conservative, scope-preserving, and grounded in evidence.
- Treat every recommendation as provisional until the human accepts or replaces it.
</rules>

<question_requirements>
For each question, provide:
- "question": a clear, specific business question
- "recommendation": the safest scope-preserving suggested answer
- "context": why the answer changes PBB traceability or backlog scope
</question_requirements>

<output_format>
Return ONLY one raw JSON array, with no Markdown fences or prose, matching this schema:
[
  { "id": 1, "question": "...", "recommendation": "...", "context": "..." }
]
</output_format>
