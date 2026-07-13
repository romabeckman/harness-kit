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
  report    Print token usage report for the current session
  version   Show version
  help      Show this help message

RUN OPTIONS
  --agent, -a <type>        Specify agent type (e.g., 'copilot-sdk', 'antigravity-cli')
  --model, -m <name>        Specify model name for the agent
  --copilot-sdk             Shorthand for --agent copilot-sdk
  --gemini                  Shorthand for --agent gemini

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

PHASE A OPTIONS
  --complexity, -c <val>    Force complexity classification: SIMPLE|S or COMPLEX|C (default: AUTO)

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
  hrns run --reset --scope "Fix login bug" --path ./api --complexity S
  hrns run --reset --scope "New payment flow" --path ./api --complexity COMPLEX
  hrns report
  npx @romabeckman/hrns run --gemini

DOCS
  https://github.com/romabeckman/harness-kit
`
