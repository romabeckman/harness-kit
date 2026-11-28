---
name: pbb-design
description: >
  Designs a Product Backlog using the Product Backlog Building (PBB)
  methodology from an initial product or feature scope.
---

<pbb_design>

<execution_mode>

## Mode Detection

Use autonomous mode when invoked by `autonomous-orchestrator` or given an explicit
autonomous runtime context. Otherwise use interactive mode.

- **Interactive.** Ask one material question at a time. Show its suggested
  answer, rationale, and affected scope. Let the person accept, replace, defer,
  or mark the answer unknown. Preserve their wording and the original
  suggestion. Finalize after each question has one of these dispositions.
- **Autonomous.** Continue without prompts. For each new material gap, record
  the suggested answer and rationale and use the suggestion provisionally when
  supported. Preserve an unresolved state when there is no grounded suggestion
  or the sources conflict. A model suggestion never confirms a business
  decision.

In both modes, consult existing answers before asking or inferring. Preserve
prior human answers, deferrals, and unknowns entry by entry. Apply an explicit
human decision to the affected records even when it replaces a prior decision
or contradicts the suggestion. Record which decision it revises.

</execution_mode>

<objective>

# PBB Design

Transform an initial product or feature scope into a traceable Product Backlog
using Product Backlog Building (PBB). Keep architecture and implementation
details in technical refinement.

</objective>

<input>

Use the supplied product or feature scope as the primary input. Use additional
project context and decision history when relevant. Keep each material claim
tied to evidence or marked as unknown or provisional.

When refining an existing project, read `docs/business/intent.md` if present.
Read other business documents only when they inform the backlog, such as
steering for priorities or scope for boundaries. Find them through the project's
`docs/.graph.json` or directly under `docs/business/`.

</input>

<process>

<step id="1" name="understand-product">

## 1. Understand the Product

Extract the product name or temporary name, intention, included scope, and known
boundaries. Catalogue the source sections or identifiable excerpts that support
the records. A requested capability can be confirmed while its cause or benefit
remains uncertain.

</step>

<step id="2" name="identify-problems">

## 2. Identify Problems

Describe the concrete difficulty people encounter today and record its basis.
For example, describe how users struggle to determine their account status.
Use a grounded assumption or preserve the gap if the scope supplies only a
solution.

</step>

<step id="3" name="identify-expectations">

## 3. Identify Expectations

Link each expectation to the problem it addresses and record the observable
change a person or the business expects. Use metrics only when supplied.

</step>

<step id="4" name="identify-personas">

## 4. Identify Personas

Include personas that interact with or are directly affected by the product.
Identify their role, what they do today, the difficulty they face, and what
they want to do with the product. Link the associated problems and expectations.
Ask about a missing activity when it changes a decision. Record grounded
inferences as provisional and preserve other missing details as unknown.

</step>

<step id="5" name="identify-functionalities">

## 5. Identify Functionalities

Start from the persona's activity. Name each functionality as an action, such
as “Browse courses.” Link the personas, problems, and expectations it addresses.
State the specific benefit and its basis. Group PBIs that support the activity
and identify which benefit each PBI enables if the functionality has several.

</step>

<step id="6" name="generate-pbis">

## 6. Generate PBIs

Walk through each functionality in the order the persona uses it. Split it into
independently understandable actions with observable outcomes and benefits.
Use a concise description or a user story. Record journey order where it
matters. Parallel or alternative actions can have no journey position.

After decomposition, compare PBIs in the same scope for commercial delivery.
Use the declared objective and available evidence of impact, frequency, or
commitment. Explain the order in one sentence per item. Distinguish confirmed
order, an evidence-based proposal, and pending order. Preserve justified ties.
File position and journey position never determine delivery rank.

In interactive mode, show the proposed order when a material choice remains.
Prefer a comparative question that can settle multiple ranks. Use explicit
ordering evidence already supplied.

Identify what can be refined now and what requires a decision. A priority gap
alone can coexist with known behavior ready for refinement. When a behavior
gap leaves an independent outcome with its own value, give that outcome its
own PBI.

</step>

<step id="7" name="validate-traceability">

## 7. Validate Traceability

Verify each PBI's links to its functionality, persona, main problem, and main
expectation. Check the source or decision behind each material claim and link
any assumptions or questions that affect the PBI, including inherited ones.
Derive the index from the PBI blocks and verify agreement in both directions.

</step>

<step id="8" name="identify-gaps">

## 8. Review Gaps and Apply Decisions

Raise gaps during discovery before consolidating the affected decisions. Ask
when the answer changes scope, behavior, benefit, or delivery order. Describe
the affected behavior and records and ground each recommendation in the
available evidence. If sources disagree, cite both and preserve the
disagreement until a decision resolves it.

Apply the outcomes of the questions according to the execution mode. Recheck
the affected outcomes, benefits, relative priorities, refinement states, and
index links after a decision changes, even if it arrives late. Preserve work
that is independent of a local gap. A documented question with its impact and
affected items is a valid discovery result. Use an empty question history
when the scope already supplies the necessary decisions.

</step>

</process>

<output_format>

When preparing the final backlog, read the normative
[PBB Markdown output contract](references/output-contract.md). Produce one
canonical Markdown document using its nine sections, stable record IDs, and
the `PBB-Contract: 2` marker. Discovery of questions can run without loading
the reference example.

When reviewing an existing backlog, keep its IDs and decision history. Reuse
legacy backlogs by their section headings. Convert a legacy document only
when requested, using the available evidence and preserving unknowns.
Validate the revised document before replacing the original.

</output_format>

<validation>

Before returning the document, run the checks in the output contract. Verify
that a reader can recover the supported outcome, commercial order, and pending
decisions for one PBI from its links.

</validation>

</pbb_design>
