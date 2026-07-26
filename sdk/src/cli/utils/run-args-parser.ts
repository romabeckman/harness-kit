import { Complexity } from "../../orchestrator/types"

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

  // Skip Phase C (validation) entirely — jumps directly to Phase D
  skipValidation?: boolean

  // Skip Phase E (project-memory / steering) entirely — jumps directly to Phase F
  skipSteering?: boolean

  // Complexity hint for Phase A scope refinement ('SIMPLE' | 'COMPLEX' | undefined = AUTO)
  complexity: Complexity
}

/**
 * Parses the `args` slice that follows the `run` command.
 *
 * Recognised flags
 * ─────────────────
 * --agent, -a <type>       Agent type
 * --model, -m <name>       Model name
 * --reset                  Force reset action (skip interactive prompt)
 * --resume                 Force resume action (skip interactive prompt)
 * --scope <text>           Project scope / PRD
 * --path <dir>             Add a directory to projectPaths (repeatable)
 * --score <0.1-1>          Acceptance score threshold
 * --reworks <1-10>         Max rework cycles before cascade fail
 * --steering <text>        Additional orchestration rules
 * --complexity, -c <val>   Force complexity: SIMPLE|S or COMPLEX|C (default: AUTO)
 * --skip-validation         Skip Phase C (validation) — jump directly to Phase D
 * --skip-steering           Skip Phase E (project-memory) — jump directly to Phase F
 */
export function parseRunArgs(args: string[]): ParsedRunArgs {
  const result: ParsedRunArgs = {
    projectPaths: [],
    complexity: Complexity.AUTO,
  }

  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i]
    let arg: string
    let value: string | undefined

    const equalsIndex = currentArg.indexOf('=')
    if (currentArg.startsWith('--') && equalsIndex !== -1) {
      arg = currentArg.substring(0, equalsIndex)
      value = currentArg.substring(equalsIndex + 1)
    } else {
      arg = currentArg
    }

    const nextArg = () => (value !== undefined ? value : args[++i])

    switch (arg) {
      // ── agent / model ────────────────────────────────────────────────────
      case '--agent':
      case '-a':
        result.agentType = nextArg()
        break

      case '--model':
      case '-m':
        result.model = nextArg()
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
        result.scope = nextArg()
        break

      case '--path':
        result.projectPaths.push(nextArg())
        break

      case '--score':
        result.score = parseFloat(nextArg())
        break

      case '--reworks':
        result.reworks = parseInt(nextArg(), 10)
        break

      case '--steering':
        result.steeringMessage = nextArg()
        break

      case '--debug':
        result.debug = true
        break

      case '--skip-validation':
        result.skipValidation = true
        break

      case '--skip-steering':
        result.skipSteering = true
        break

      case '--complexity':
      case '-c': {
        const val = nextArg()?.toUpperCase()
        if (val === 'S' || val === Complexity.SIMPLE) result.complexity = Complexity.SIMPLE
        else if (val === 'C' || val === Complexity.COMPLEX) result.complexity = Complexity.COMPLEX
        break
      }

      // ── unknown flags — silently ignored ──────────────────────────────────
      default:
        if (arg.startsWith('--') || arg.startsWith('-')) {
          // consume next token as value if it doesn't look like a flag
          if (value === undefined && i + 1 < args.length && !args[i + 1].startsWith('-')) {
            i++
          }
        }
        break
    }
  }

  return result
}
