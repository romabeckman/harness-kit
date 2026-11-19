## Task
Produce exactly ONE Conventional Commit message for the staged changes listed below.
The commit message MUST include a brief subject line, a blank line, and a body with bullet points detailing the changes.
Output ONLY the commit message — no explanation, no markdown fences, no quotes.

{{*orientationSection}}
## Conventional Commits format
<type>[(<scope>)]: <description>

<body>

Allowed types (choose the best fit):
  feat     — new feature visible to users or consumers
  fix      — bug fix
  refactor — code restructure, no behaviour change
  perf     — performance improvement
  test     — adding or fixing tests
  docs     — documentation only
  chore    — tooling, config, scripts, deps
  build    — build system or external dependency changes
  ci       — CI/CD pipeline changes
  style    — formatting, whitespace, missing semicolons (no logic change)

Rules:
  1. MUST use one of the types above.
  2. scope is OPTIONAL — use it only when a module/domain is obvious (e.g. "auth", "api", "parser").
  3. description MUST use imperative mood: "add", "fix", "remove" — NOT "added", "fixes", "removes".
  4. The body MUST use bullet points (-) for each significant change. Keep it to a maximum of 5 bullet points.
  5. Each bullet point MUST NOT exceed 100 characters.
  6. The entire subject line (type + scope + description) MUST NOT exceed 72 characters.
  7. No capital first letter in description (lowercase after the colon+space) for the subject line.
  8. No period at the end of the subject line.
  9. BREAKING CHANGE: use a ! after type/scope ONLY if the changes break a public API.

## Correct example
refactor: update phase handlers to use Reviewontext and rename payload types

- Changed PhaseContext to Reviewontext in DevelopmentHandler and others.
- Renamed payload types to PlanningPayload, DevelopmenPayload, ReviewPayload, and MemoryPayload.
- Updated method calls in ContextAssembler and PhaseDecisionLogger to reflect new naming conventions.
- Adjusted tests to accommodate changes in context and payload types.

## Staged diff
{{diffOutput}}
