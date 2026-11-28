---
doc_type: adr
domain: orchestration
stack: [TypeScript, Node.js]
node_id: "adr:agent_sessions"
tags: [sessions, orchestrator, runners]
edges:
  - relation: references
    target: "adr:architecture"
  - relation: references
    target: "adr:agent_runners"
updated: "2026-11-27"
---
# Agent Session Management

## OVERVIEW

The orchestrator associates a runner-provided conversation identifier with an agent, a feature and a phase. Reuse depends on the runner returning a session and supporting a later invocation with that session. The SDK stores orchestration sessions in the current `HarnessOrchestrator` instance.

## SESSION LIFECYCLE

`DeveloperSessionState` contains `featureId`, `agent`, `session` and `phase`. `setDeveloperSession` replaces the entry for the same agent, feature and phase, or appends a new entry. `getDeveloperSession` matches the agent and any supplied feature and phase. Planning supplies no feature filter and stores an empty feature ID.

| Phase | Reuse | Boundary |
|---|---|---|
| Refinement | A correction to an invalid consolidation draft receives the consolidation invocation's session when available. | The correction is local to that draft. Question generation does not pass a prior session. |
| Planning | Later scope-refinement invocations reuse the software architect's Planning session and use a continuation prompt. | Shared across features in the same orchestrator instance. |
| Development | A retry with a positive rework count looks up the same developer agent, feature and Development phase. A matching session selects the continuation rework prompt. | Isolated by feature, agent and phase. |
| Review | Tech Lead and adversarial QA independently look up and update their own sessions for the active feature and Review phase. | Separate sessions per reviewer and feature, reused on subsequent reviews while retained. |

When no matching session is available, the invocation proceeds without one. A session is stored only when the invocation returns one.

## CLEANUP AND RESUMPTION

Review clears feature-specific Development and Review sessions on terminal outcomes and when validation is skipped. Review policy refusal also clears them. Transition clears non-Planning sessions and retains Planning sessions. A retry retains sessions for reuse.

The orchestrator's session collection is in memory. A newly constructed orchestrator resolves workflow phase from persisted project state but does not restore this collection. Project Dreaming records session IDs as episode evidence; those records are separate from the active session collection.

## RUNNER BOUNDARY

`AgentInvocation.session` carries the native identifier to the selected runner, and `AgentOutput.session` returns it when the adapter provides one. Support differs across adapters. CLI runners translate identifiers into their native resume arguments. The Kiro adapter forwards an existing identifier with `--resume-id` but its current output parser returns a session only when one was supplied. Copilot SDK creates and disconnects a session without returning it to the orchestrator.

Sources: `src/orchestrator/HarnessOrchestrator.ts` (`getDeveloperSession`, `setDeveloperSession`), `src/orchestrator/utils/SessionHelpers.ts`, the Refinement, Planning, Development, Review and Transition implementations, and `src/agent-runner/` adapters.

## REFERENCES

- [ARCHITECTURE.md](./ARCHITECTURE.md) — orchestration architecture.
- [AGENT-RUNNERS.md](./AGENT-RUNNERS.md) — runner-specific invocation and output.
- [SDK_CORE.md](../feature/orchestration/SDK_CORE.md) — phase lifecycle.
