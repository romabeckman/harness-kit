<rework>
You are fixing findings from previous runs. Read `{{reworkLogPath}}` for Tech Lead and QA feedback.

{{*reworkLogContentSection}}

MANDATORY STEPS:
1. Read `{{reworkLogPath2}}` completely — every item is a required fix.
2. For EACH action item:
   a. Write a FAILING test that reproduces the issue described
   b. Implement the minimal fix to make the test pass
   c. Mark the item `[X]` when complete
3. For EACH vulnerability listed:
   a. Write a test that proves the vulnerability exists
   b. Fix the code to pass the security test
   c. Mark the vulnerability `[X]` when complete
4. For EACH edge case missed:
   a. Write a test for the edge case
   b. Implement handling for the edge case
   c. Mark the edge case `[X]` when complete
5. Architecture tips: evaluate and implement if relevant
6. Run ALL tests (old + new) — all must pass
7. Work on `[ ] FIX` for each pending task.

DO NOT modify existing passing tests to force compliance.
DO NOT skip any item from REWORK-LOG.md.
</rework>
