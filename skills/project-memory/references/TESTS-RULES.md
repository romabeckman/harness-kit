# Tests Rules

This document establishes the standards for creating and maintaining the `./docs/TESTS.md` file. Use this as a reference whenever you are tasked with documenting the project's testing protocol.

## Objective

The `./docs/TESTS.md` file must provide a clear, actionable guide on how to run tests, what is being tested, and the quality standards (coverage) required for the project.

## Analysis Phase

Before generating the document, analyze the project to identify:
- **Test Framework:** Which tool is used (e.g., Jest, Vitest, Pytest, Go Test).
- **Test Types:** Presence of Unit, Integration, E2E, or Smoke tests.
- **Commands:** How to run all tests, specific suites, and coverage reports.
- **Coverage Tool:** Which tool reports coverage (e.g., c8, istanbul, coverage.py).
- **Mocking Strategy:** How external dependencies are handled (e.g., MSW, mocks, stubs).

## Output Requirements

### Document Format
Your response must be structured as a complete documentation file that will be saved as:

**File:** `./docs/TESTS.md`

**Language:** Portuguese (Brazil)

**Structure:** The document must include all sections below written in Portuguese (Brazil).

### Template structure for `docs/TESTS.md`

```markdown
# Tests Protocol

## OVERVIEW
[Testing philosophy, main frameworks used, and overall quality goal — maximum 3 lines]

## COMMANDS
| Type | Command | Description |
|------|---------|-------------|
| Unit | `npm test` | Runs all unit tests |
| Integration | `npm run test:int` | Runs integration tests |
| E2E | `npm run test:e2e` | Runs end-to-end tests |
| Coverage | `npm run test:cov` | Generates coverage report |

## MINIMUM COVERAGE
REQUIRED: The project must maintain the following minimum coverage levels:

| Layer | Coverage | Description |
|-------|----------|-------------|
| Domain / Core | 90% | Logic and business invariants |
| Application / Use Cases | 80% | Orchestration and flows |
| Infrastructure / Adapters | 70% | External integrations and persistence |
| Global | 80% | Average total coverage |

## PATTERNS & BEST PRACTICES
REQUIRED: [e.g., AAA (Arrange, Act, Assert)]
REQUIRED: [e.g., Mocking only external boundaries]
FORBIDDEN: [e.g., Logic in tests, fragile tests depending on implementation details]

## TOOLING
- **Framework:** [Name]
- **Assertions:** [Name]
- **Mocks/Stubs:** [Name]
- **CI Integration:** [How it runs in pipeline]

## TROUBLESHOOTING
- **Flaky Tests:** [How to handle or report]
- **Debug Mode:** [How to run tests in debug mode]
```

## Important Notes

- **The document must be complete and self-contained**
- **Commands must be verified against the project's real configuration (e.g., package.json)**
- **Coverage levels should be realistic but challenging**
- **Follow markdown formatting standards**
