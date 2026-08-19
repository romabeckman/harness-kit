export const DEFAULT_LINE_LENGTH = 80
export const DEFAULT_SCORE = 0.7
export const DEFAULT_REWORKS = 2

export const HELP = `
@romabeckman/harness-kit — autonomous orchestrator

USAGE
  hrns <command> [options]

COMMANDS
  run       Start or resume an orchestration session
  init      Initialize docs/product files and configure steering rules
  settings  Manage settings (edit|renew|delete)
  diagnose  Run post-orchestration harness diagnosis on pending sessions
  candidate Review and apply meta-harness optimization candidates
  report    Print development status and token usage report for the current session
  version   Show version
  help      Show this help message

RUN OPTIONS
  --agent, -a <type>        Specify agent type (e.g., 'copilot-sdk', 'antigravity-cli')
  --model, -m <name>        Specify model name for the agent

ACTION (skips interactive prompt)
  --reset                   Discard current session and start a new cycle
  --resume                  Continue from last session

RESET OPTIONS (all optional — omitting any triggers the interactive wizard)
  --scope <text>            Project scope / PRD description
  --path <dir>              Add a directory to project paths (repeatable)
  --score <0.1-1>           Acceptance score threshold (default: \${DEFAULT_SCORE})
  --reworks <1-10>          Max rework cycles before cascade fail (default: \${DEFAULT_REWORKS})
  --steering <text>         Additional orchestration rules

RESUME OPTIONS
  --steering <text>         Steering rules or state overrides

EXECUTION MODE
  --mode, -M <mode>         Controls which phases run and which complexity is forced:
                              quick   — Bootstrap → Planning → Development → Deploy (skip Review + Memory)
                              fast    — All phases, simplify planning and only QA review
                              default — All phases, LLM decide complexity [default]
                              slow    — All phases, forced to high planning and deep review
  --complexity, -c <level>  Explicit complexity override: LOW | HIGH | AUTO

SKIP OPTIONS
  --skip-validation         Skip Phase REVIEW (code review + QA) - jump directly to TRANSITION
  --skip-memory             Skip Phase MEMORY (project-memory) — jump directly to TRANSITION
  --skip-deploy             Skip Phase DEPLOY (git stage/commit/push) — halt after TRANSITION
  --refine                  Enable interactive pre-planning REFINEMENT phase (default: false)

OPTIONS
  --help, -h                Show this help message
  --version, -v             Show version
  --debug                   Enable debug mode (expose errors, print prompts, CLI args)

EXAMPLES
  hrns run
  hrns run --agent copilot-sdk --model gpt-4o
  hrns run --reset --scope "Build a REST API" --path ./api --path ./web --score 0.9
  hrns run --resume --steering "focus on security hardening"
  hrns run --debug --reset --scope "My project"
  hrns run --reset --scope "Fix login bug" --path ./api --mode fast
  hrns run --reset --scope "New payment flow" --path ./api --mode slow
  hrns run --reset --scope "My app" --path ./api --mode quick
  hrns run --reset --scope "My app" --path ./api --complexity LOW
  hrns run --reset --scope "My app" --path ./api --skip-deploy
  hrns diagnose
  hrns candidate list
  hrns candidate review v001
  hrns report

DOCS
  https://github.com/romabeckman/harness-kit
`

export const HELP_RUN = `
@romabeckman/harness-kit — hrns run

USAGE
  hrns run [options]

DESCRIPTION
  Start a new autonomous orchestration cycle or resume an existing session.

RUN OPTIONS
  --agent, -a <type>        Specify agent runner (e.g. 'claude-cli', 'copilot-cli', 'antigravity-cli')
  --model, -m <name>        Specify model name for the agent
  --effort, -e <level>      Reasoning effort level (low | medium | high | xhigh)
  --complexity, -c <level>  Explicit complexity override: LOW | HIGH | AUTO

ACTION (skips interactive prompt)
  --reset                   Discard current session and start a new cycle
  --resume                  Continue from last saved session

RESET OPTIONS (omitting triggers wizard when reset is chosen)
  --scope <text>            Project scope / PRD description
  --path <dir>              Add a directory to project paths (repeatable)
  --score <0.1-1>           Acceptance score threshold (default: ${DEFAULT_SCORE})
  --reworks <1-10>          Max rework cycles before cascade fail (default: ${DEFAULT_REWORKS})
  --steering <text>         Additional orchestration rules

RESUME OPTIONS
  --steering <text>         Steering rules or state overrides

EXECUTION MODE
  --mode, -M <mode>         Controls phase execution and forced complexity:
                              quick   — Bootstrap → Planning → Development → Deploy (skip Review + Memory)
                              fast    — All phases, simplified planning, QA review only
                              default — All phases, LLM decides complexity [default]
                              slow    — All phases, forced high planning and deep review
  --complexity, -c <level>  Explicit complexity override: LOW | HIGH | AUTO

SKIP OPTIONS
  --skip-validation         Skip Phase REVIEW (code review + QA) — jump directly to TRANSITION
  --skip-memory             Skip Phase MEMORY (project-memory) — jump directly to TRANSITION
  --skip-deploy             Skip Phase DEPLOY (git stage/commit/push) — halt after TRANSITION
  --refine                  Enable interactive pre-planning REFINEMENT phase (default: false)

GENERAL OPTIONS
  --help, -h                Show this help message
  --debug                   Enable debug mode (expose errors, print prompts and CLI args)

EXAMPLES
  hrns run
  hrns run --diagnose
  hrns run --agent copilot-cli --model gpt-5.6-luna
  hrns run --reset --scope "Build a REST API" --path ./api --path ./web --score 0.9
  hrns run --resume --steering "focus on security hardening"
  hrns run --reset --scope "Fix bug" --path ./api --mode fast
`

export const HELP_INIT = `
@romabeckman/harness-kit — hrns init

USAGE
  hrns init

DESCRIPTION
  Initialize docs/product tracking files in the current workspace and configure
  optional steering rules across all orchestration phases via an interactive wizard.

CREATED FILES
  docs/product/
  ├── backlog.md            # Product backlog and feature tracking
  ├── memory.md             # Project decisions and memory
  ├── steering-rules.md     # Phase-specific steering directives
  └── tokens.jsonl          # Telemetry and token usage ledger

OPTIONS
  --help, -h                Show this help message

EXAMPLES
  hrns init
`

export const HELP_SETTINGS = `
@romabeckman/harness-kit — hrns settings

USAGE
  hrns settings [action]

ACTIONS
  edit                      Open settings.json in the default editor
  renew                     Recreate settings.json with default configuration
  delete                    Delete existing settings.json file

TARGETS
  When an action is executed, you can select the target configuration:
  - global                  Global config (~/.config/harness-kit/settings.json)
  - local                   Project-specific config (.harness-kit/settings.json)

OPTIONS
  --help, -h                Show this help message

EXAMPLES
  hrns settings
  hrns settings edit
  hrns settings renew
  hrns settings delete
`

export const HELP_DIAGNOSE = `
@romabeckman/harness-kit — hrns diagnose

USAGE
  hrns diagnose [options]

DESCRIPTION
  Run post-orchestration harness diagnosis and optimization using meta-harness-agent.
  Reads recorded sessions from docs/product/diagnose-sessions.jsonl, processes pending
  sessions in batches of 3, and updates trace history and candidate improvements.

OPTIONS
  --agent, -a <type>        Specify agent runner (e.g. 'claude-cli', 'copilot-cli', 'antigravity-cli')
  --model, -m <name>        Override model name (defaults to DefaultSettings.ts diagnose model)
  --effort, -e <level>      Override reasoning effort level (defaults to DefaultSettings.ts diagnose effort)
  --batch-size <number>     Number of pending sessions to process per batch (default: 3)
  --debug                   Enable debug output
  --help, -h                Show this help message

EXAMPLES
  hrns diagnose
  hrns diagnose --agent copilot-cli
  hrns diagnose --model gpt-5.6-luna --effort xhigh
  hrns diagnose --batch-size 5
`

export const HELP_CANDIDATE = `
@romabeckman/harness-kit — hrns candidate

USAGE
  hrns candidate <action> [options]

DESCRIPTION
  Review and apply meta-harness optimization candidates created in docs/harness-history/candidates/.

ACTIONS
  list, ls                  List all candidates and their promotion status
  review [candidate_id]     Launch interactive AI runner session to review & apply candidate (default)
  review [id] --auto        Apply candidate autonomously via LLM using phaseKey: diagnose

OPTIONS
  --model, -m <name>        Override model name for autonomous promotion
  --effort, -e <level>      Override reasoning effort level
  --non-interactive, --auto Apply candidate autonomously without interactive runner
  --help, -h                Show this help message

EXAMPLES
  hrns candidate list
  hrns candidate review v001
  hrns candidate review v001 --auto
`

export const HELP_REPORT = `
@romabeckman/harness-kit — hrns report

USAGE
  hrns report

DESCRIPTION
  Print the development status report, feature progress, and detailed token usage
  analytics aggregated from docs/product/tokens.jsonl for the current workspace.

OPTIONS
  --help, -h                Show this help message

EXAMPLES
  hrns report
`

export const HELP_VERSION = `
@romabeckman/harness-kit — hrns version

USAGE
  hrns version
  hrns --version, -v

DESCRIPTION
  Display the currently installed version of @romabeckman/harness-kit SDK.
`

export const COMMAND_HELP: Record<string, string> = {
  run: HELP_RUN,
  init: HELP_INIT,
  settings: HELP_SETTINGS,
  diagnose: HELP_DIAGNOSE,
  candidate: HELP_CANDIDATE,
  report: HELP_REPORT,
  version: HELP_VERSION,
}
