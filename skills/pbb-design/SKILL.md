---
name: pbb-design
description: >
  Designs a Product Backlog using the Product Backlog Building (PBB)
  methodology from an initial product or feature scope.
---

<pbb_design>

<execution_mode>

## Mode Detection — Resolve Before Anything Else

```text
IF invoked by autonomous-orchestrator or an explicit autonomous runtime context:
    mode = AUTONOMOUS
    Skip all interactive prompts.
    For each decision-relevant gap:
        Generate a suggested answer and rationale.
        Use the suggested answer as the resolved answer.
        Set answered_by = "model".
        Mark the answer as a provisional model assumption.
    Continue through backlog generation without pausing.

OTHERWISE:
    mode = INTERACTIVE
    For each decision-relevant gap:
        Ask one question at a time.
        Show the suggested answer and rationale.
        Let the human accept, replace, defer, or mark the answer unknown.
        Preserve the human answer exactly.
        Set answered_by = "human" for accepted or replaced answers.
    Do not finalize the backlog until all questions are answered, deferred, or
    marked unknown.
```

In both modes, apply resolved answers to affected problems, expectations,
personas, functionalities, and PBIs before final validation. Never present an
autonomous answer as a confirmed business fact.

</execution_mode>

<objective>

# PBB Design

Transform an initial product or feature scope into a structured Product Backlog
using Product Backlog Building (PBB).

Discover and organize:

1. Problems
2. Expectations
3. Personas
4. Functionalities
5. Product Backlog Items (PBIs)

Do not design software architecture or implementation details.

</objective>

<input>

Use the supplied product or feature scope as the primary input. Use additional
project context when available and relevant.

Example:

> Create an online programming course platform where users can browse courses
> by category, view course details, and contact the company.

</input>

<principles>

- Start from the problem, not from the solution.
- Keep customer needs visible throughout refinement.
- Identify who interacts with the product before defining backlog items.
- Describe functionalities at a higher level than user stories.
- Derive every PBI from a functionality.
- Do not invent unsupported business rules.
- Mark assumptions and open questions explicitly.
- Keep business refinement separate from technical design.

</principles>

<process>

<step id="1" name="understand-product">

## 1. Understand the Product

Extract the product name or temporary name, objective, boundaries, and relevant
business context. Write a concise product intention.

</step>

<step id="2" name="identify-problems">

## 2. Identify Problems

Describe undesirable situations that motivate the product or feature. Do not
state solutions as problems.

Bad: Need a dashboard.

Good: Users cannot easily understand their current account status.

Mark any problem that cannot be inferred safely as an assumption.

</step>

<step id="3" name="identify-expectations">

## 3. Identify Expectations

For each relevant problem, identify the desired user or business outcome.

Example:

- Problem: Users cannot find available courses efficiently.
- Expectation: Users should quickly discover courses relevant to their interests.

</step>

<step id="4" name="identify-personas">

## 4. Identify Personas

Include only personas that interact with or are directly affected by the
product. For each persona, describe:

- Name or role
- Primary goal
- Relevant interactions
- Relevant problems and expectations

Avoid fictional demographic details that do not affect the backlog.

</step>

<step id="5" name="identify-functionalities">

## 5. Identify Functionalities

Discover the main interactions between personas and the product. Each
functionality must represent recognizable user value, describe what the product
enables, avoid implementation details, and group related PBIs.

Prefer concise action-oriented names such as:

- Browse courses
- Enroll in course
- Manage course catalog
- Contact support

</step>

<step id="6" name="generate-pbis">

## 6. Generate PBIs

Break each functionality into small Product Backlog Items. Each PBI must deliver
observable value, belong to a functionality, identify the relevant persona, be
independently understandable, and avoid unnecessary implementation details.

When appropriate, express a PBI as:

```text
As a <persona>
I want <capability>
So that <benefit>
```

Do not force this format when another concise PBI description is clearer.

</step>

<step id="7" name="validate-traceability">

## 7. Validate Traceability

Verify this chain for every PBI:

```text
Problem / Expectation
        ↓
Persona
        ↓
Functionality
        ↓
PBI
```

Remove orphan PBIs.

</step>

<step id="8" name="identify-gaps">

## 8. Identify Gaps

Identify information that cannot safely be derived from the scope. Do not
silently invent business rules, permissions, pricing rules, integrations,
regulatory requirements, workflows, or technical constraints.

Turn each decision-relevant gap into an open question. Add a suggested answer
that is conservative, scope-preserving, and grounded in supplied information.
Label the suggestion as an assumption requiring validation, never as a decided
business rule.

Resolve each question according to `<execution_mode>` before producing the final
backlog. Keep deferred and unknown questions unresolved. In autonomous mode,
select the suggested answer automatically and record it as a provisional model
assumption.

</step>

</process>

<output_format>

Produce Markdown with these sections in this order:

1. `## 1. Product`
2. `## 2. Problems`
3. `## 3. Expectations`
4. `## 4. Personas`
5. `## 5. Functionalities`
6. `## 6. Product Backlog`
7. `## 7. Traceability`
8. `## 8. Assumptions`
9. `## 9. Open Questions`

In `## 9. Open Questions`, use this format for every question:

```markdown
### Q01 — [Question]

**Suggested answer:** [Recommended answer]

**Rationale:** [Why this is the safest or most scope-preserving recommendation]

**Resolved answer:** [Human answer, model-selected suggestion, or `Unresolved`]

**Answered by:** [human | model | unresolved]

**Status:** [Human validated | Provisional model assumption | Deferred | Unknown]
```

In interactive mode, retain the suggested answer even when the human replaces
it. In autonomous mode, copy the suggested answer into `Resolved answer`, set
`Answered by` to `model`, and set `Status` to `Provisional model assumption`.

Do not fabricate questions to populate the section. If no decision-relevant gap
exists, write `No open questions.`

</output_format>

<validation>

- Every expectation addresses a problem.
- Every persona connects to a relevant problem or expectation.
- Every functionality connects a persona to recognizable product value.
- Every PBI belongs to a functionality and traces to a user or product need.
- Every suggested answer remains explicitly provisional.
- Every resolved question identifies who answered it and its validation status.
- Interactive mode never resolves a deferred or unknown question automatically.
- Autonomous mode never pauses for answers or presents model assumptions as facts.
- No architecture or implementation detail appears in the backlog.

</validation>

</pbb_design>
