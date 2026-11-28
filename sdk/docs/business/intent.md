---
node_id: "business:intent"
tags: [business, objectives, orchestration]
---
# Business Intent

## PURPOSE

The SDK provides a CLI and a programmable interface for running HarnessKit's autonomous, test-driven development workflow from project scope through review and project memory. It lives in the `sdk/` directory of `romabeckman/harness-kit`.

## CONTEXT

The CLI supports starting or resuming a run. The workflow tracks progress across features, reworks changes when review criteria are unmet, and records what was learned for later work. Operators can skip deployment and retain control over that step.

## BUSINESS OBJECTIVES

The following objectives are inferred from the SDK's stated purpose and documented workflow.

- Reduce manual handoffs between scope refinement, implementation, and review.
- Make progress, failed checks, and blocked work visible so operators can decide how to proceed.
- Preserve decisions and project context so later work can build on them.

## DECISION GUIDANCE

- Which objective does the proposed change advance, and how would an operator observe the improvement?
- How will the operator see failures, resume work, and control deployment after the change?

## OPEN QUESTIONS

- What measures and targets define success for these objectives?

## REFERENCES

- [Project architecture and orchestration phases](../adr/ARCHITECTURE.md)
- [SDK orchestration, review, and project memory](../feature/orchestration/SDK_CORE.md)
- [CLI options for resuming runs and controlling deployment](../feature/cli/sdk_cli.md)
