---
doc_type: adr
domain: telemetry
stack: [TypeScript, Node.js]
node_id: "adr:telemetry"
tags: [telemetry, ledger, tokens, costs]
edges:
  - relation: references
    target: "adr:architecture"
updated: "2026-11-28"
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
3. Invoke `ledger.printReport()` to view token usage and estimated cache savings in the terminal.

<code_example>
# CORRECT: Log token usage and cost metrics to the ledger
if (output.usage) {
  this.ledger.record(invocation.skill, invocation.agent, output.usage)
}

# WRONG: Discard agent execution usage details without updating the ledger
const output = await runner.run(invocation) // Ignores token tracking metadata
</code_example>

## CACHE SAVINGS REPORT
The terminal report aggregates the entire ledger. Savings are estimates weighted by cached token count for each record, using model-family reference rates; unknown model rates contribute zero. Gemini Neon and Hydrogen use $2.85 and $1.425 per million cache-read tokens, respectively. Gemini Carbon and Argon use $1.90 before December 1, 2026, and $3.80 thereafter, based on the record timestamp. Other models use the existing estimated tier rates. Reported savings exclude cache storage and other charges. The terminal does not display invocation cost.

## CACHE INPUT SHARE
The percentage divides total cached input by total input across records. Codex CLI reports cached input inside input tokens; Claude CLI and Claude SDK report uncached input, cache writes, and cache reads separately. The report omits the percentage if any nonempty record has an unsupported runner, if counts are invalid or negative, if cached input exceeds total input, or if total input is zero. Gemini runner accounting is not yet used for this percentage. Raw ledger values are preserved.

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
PROHIBITED: Duplicate token metrics at the event root and inside `tokenUsage`.
PROHIBITED: Execute orchestrator loops without an active `TokenLedger` tracking backend.

## REFERENCES
- [**ARCHITECTURE.md**](ARCHITECTURE.md): Global patterns and Ports-and-Adapters layer details.
- [**TESTS.md**](TESTS.md): Vitest runner mock execution protocols.
