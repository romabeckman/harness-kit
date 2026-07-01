export const DEFAULT_LINE_LENGTH = 80
export const DEFAULT_SCORE = 0.7
export const DEFAULT_REWORKS = 2
export const HELP = `
@romabeckman/harness-kit — autonomous orchestrator

USAGE
  hrns <command> [options]

COMMANDS
  run       Start or resume an orchestration session (interactive)
  report    Print token usage report for the current session
  version   Show version
  help      Show this help message

RUN OPTIONS
   --agent, -a <type>        Specify agent type (e.g., 'copilot', 'antigravity')
  --model, -m <name>        Specify model name for the agent

OPTIONS
  --help, -h          Show this help message
  --version, -v       Show version

EXAMPLES
  hrns run
  hrns run --agent copilot --model gpt-4o
  hrns report
  npx @romabeckman/hrns run --gemini

DOCS
  https://github.com/romabeckman/harness-kit
`
