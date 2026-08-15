---
doc_type: adr
domain: telemetry
stack: [TypeScript, Node.js]
node_id: "adr:telemetry"
tags: [telemetry, ledger, tokens, costs]
edges:
  - relation: references
    target: "adr:architecture"
updated: "2026-08-15"
---
# Telemetry and Ledger
Tracks token consumption, execution costs, and quota limits across agent run cycles.

## OVERVIEW
Telemetry is written to an NDJSON ledger file after every agent execution to calculate costs, prompt token savings, and abort gracefully when rate limits or quotas are exceeded.
New records store token metrics only in `tokenUsage`; readers normalize legacy flat records for backward compatibility.

## FOLDER STRUCTURE
<folder_structure>
sdk/
├── src/
│   ├── telemetry/
│   │   └── TokenLedger.ts        # Appends token records and prints reports
│   └── orchestrator/
│       └── services/
│           └── AgentInvocationService.ts # Records telemetry on execution output
└── docs/
    └── product/
        └── tokens.jsonl          # NDJSON file holding raw token counts
</folder_structure>

## HOW TO RECORD AND PRINT TELEMETRY
### Prerequisites
1. Product docs directory initialized.
2. Valid `TokenUsage` object returned by an agent runner.

### Steps
1. Capture agent invocation output containing `usage` metadata.
2. Call `ledger.record(skill, agent, usage)` to append a canonical audit event to `tokens.jsonl`.
3. Invoke `ledger.printReport()` to view cost and savings summaries in the terminal.

<code_example>
# CORRECT: Log token usage and cost metrics to the ledger
if (output.usage) {
  this.ledger.record(invocation.skill, invocation.agent, output.usage)
}

# WRONG: Discard agent execution usage details without updating the ledger
const output = await runner.run(invocation) // Ignores token tracking metadata
</code_example>

## PARAMETERS / CONFIGURATIONS
| Name | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| inputTokens | number | Yes | Input tokens sent in the prompt | — |
| outputTokens | number | Yes | Output tokens received in the completion | — |
| costUsd | number | Yes | Estimated cost of the invocation in USD | 0.00 |

## BEST PRACTICES
REQUIRED: Write token metrics only inside `tokenUsage` in new JSONL records.
REQUIRED: Normalize legacy flat token metrics when reading existing ledgers.
REQUIRED: Handle QUOTA_EXCEEDED errors gracefully by persisting the active phase state and halting.
REQUIRED: Print cumulative token savings reports via `rtk gain` and `ledger.printReport()`.
FORBIDDEN: Duplicate token metrics at the event root and inside `tokenUsage`.
FORBIDDEN: Executing orchestrator loops without an active `TokenLedger` tracking backend.

## REFERENCES
- [**ARCHITECTURE.md**](./ARCHITECTURE.md): Global patterns and Ports-and-Adapters layer details.
- [**TESTS.md**](./TESTS.md): Vitest runner mock execution protocols.
