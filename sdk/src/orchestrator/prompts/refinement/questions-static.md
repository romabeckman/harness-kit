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
- CRITICAL: Do not narrate progress or emit interim status updates. Use tools and internal reasoning normally.
- Ask 0-12 questions for PBB business discovery. Do not fabricate gaps to reach a quota.
- Put the most consequential question first. The handler asks that question before requesting a fresh assessment of the remaining decisions.
- Focus on missing business outcomes, boundaries, personas, permissions, workflows,
  pricing, integrations, and regulatory needs that change the Product Backlog.
- Ask about current activity, difficulty, desired activity, benefit, or comparative
  delivery order when the answer changes scope, behavior, benefit, or priority.
  A comparative question can resolve several PBIs. Do not ask when evidence already
  answers the question or fabricate priority from a requirements list.
- Do not ask architecture, implementation, framework, or code questions for business discovery.
- Recommendations must be conservative, scope-preserving, and grounded in evidence.
- Treat every recommendation as provisional until the human accepts or replaces it.
- Preserve any existing decision history and reserve its Q IDs when assigning
  numeric IDs to new questions. Do not ask a question already answered or deferred.
</rules>

<question_requirements>
For each question, provide:
- "question": a clear, specific business question
- "recommendation": the safest scope-preserving suggested answer
- "context": why the answer changes PBB traceability or backlog scope
- "category": "business" or "setup", so setup answers stay outside the business PBIs
</question_requirements>

<output_format>
Write one JSON array to the questions file, with no Markdown fences or prose, matching this schema:
[
  { "id": 1, "question": "...", "recommendation": "...", "context": "...", "category": "business" }
]
</output_format>
