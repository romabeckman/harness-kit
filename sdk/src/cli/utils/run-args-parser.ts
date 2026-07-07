/**
 * Parsed result of CLI run arguments.
 * All fields are optional — only present when explicitly supplied.
 */
export interface ParsedRunArgs {
  // RunOptions (agent runner)
  agentType?: string
  model?: string

  // Action selector (skip interactive prompt when provided)
  action?: 'reset' | 'resume'

  // ResetOptions fields
  scope?: string
  projectPaths: string[]
  score?: number
  reworks?: number
  steeringMessage?: string

  // Debug mode
  debug?: boolean

  // Complexity hint for Phase A scope refinement ('SIMPLE' | 'COMPLEX' | undefined = AUTO)
  complexity?: 'SIMPLE' | 'COMPLEX'
}

/**
 * Parses the `args` slice that follows the `run` command.
 *
 * Recognised flags
 * ─────────────────
 * --agent, -a <type>       Agent type
 * --model, -m <name>       Model name
 * --copilot-sdk            Shorthand for --agent copilot-sdk
 * --gemini                 Shorthand for --agent gemini
 * --reset                  Force reset action (skip interactive prompt)
 * --resume                 Force resume action (skip interactive prompt)
 * --scope <text>           Project scope / PRD
 * --path <dir>             Add a directory to projectPaths (repeatable)
 * --score <0.1-1>          Acceptance score threshold
 * --reworks <1-10>         Max rework cycles before cascade fail
 * --steering <text>        Additional orchestration rules
 * --complexity, -c <val>   Force complexity: SIMPLE|S or COMPLEX|C (default: AUTO)
 */
export function parseRunArgs(args: string[]): ParsedRunArgs {
  const result: ParsedRunArgs = {
    projectPaths: [],
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      // ── agent shorthands ─────────────────────────────────────────────────
      case '--copilot-sdk':
        result.agentType = 'copilot-sdk'
        break

      case '--gemini':
        result.agentType = 'gemini'
        break

      // ── agent / model ────────────────────────────────────────────────────
      case '--agent':
      case '-a':
        result.agentType = args[++i]
        break

      case '--model':
      case '-m':
        result.model = args[++i]
        break

      // ── action selector ──────────────────────────────────────────────────
      case '--reset':
        result.action = 'reset'
        break

      case '--resume':
        result.action = 'resume'
        break

      // ── ResetOptions ─────────────────────────────────────────────────────
      case '--scope':
        result.scope = args[++i]
        break

      case '--path':
        result.projectPaths.push(args[++i])
        break

      case '--score':
        result.score = parseFloat(args[++i])
        break

      case '--reworks':
        result.reworks = parseInt(args[++i], 10)
        break

      case '--steering':
        result.steeringMessage = args[++i]
        break

      case '--debug':
        result.debug = true
        break

      case '--complexity':
      case '-c': {
        const val = args[++i]?.toUpperCase()
        console.log('complexity value: ' + val)
        if (val === 'S' || val === 'SIMPLE') result.complexity = 'SIMPLE'
        else if (val === 'C' || val === 'COMPLEX') result.complexity = 'COMPLEX'
        break
      }

      // ── unknown flags — silently ignored ──────────────────────────────────
      default:
        if (arg.startsWith('--') || arg.startsWith('-')) {
          // consume next token as value if it doesn't look like a flag
          if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
            i++
          }
        }
        break
    }
  }

  return result
}
