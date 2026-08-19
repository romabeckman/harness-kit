import { Complexity, RunMode } from "../../orchestrator/types"

/**
 * Parsed result of CLI run arguments.
 * All fields are optional — only present when explicitly supplied.
 */
export interface ParsedRunArgs {
  // RunOptions (agent runner)
  agentType?: string
  model?: string
  effort?: string

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

  // Skip Phase C (review) entirely — jumps directly to Phase D
  skipValidation?: boolean

  // Skip Phase E (memory / steering) entirely — jumps directly to Phase F
  skipMemory?: boolean

  // Skip Phase DEPLOY (git stage/commit/push) — pipeline halts after Phase F
  skipDeploy?: boolean

  // Enable interactive pre-planning REFINEMENT phase
  refine?: boolean

  // Complexity hint for Phase A scope refinement ('LOW' | 'HIGH' | undefined = AUTO)
  // Controlled via --mode or explicitly via --complexity / -c
  mode?: RunMode
  complexity?: Complexity
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
 * --mode, -M <val>         Execution mode: quick | fast | default | slow (default: default)
 * --skip-validation         Skip Phase C (review) — jump directly to Phase D
 * --skip-memory           Skip Phase E (memory) — jump directly to Phase F
 * --skip-deploy             Skip Phase DEPLOY (git stage/commit/push) — halt after Phase F
 */
export function parseRunArgs(args: string[]): ParsedRunArgs {
  const result: ParsedRunArgs = {
    projectPaths: [],
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

      case '--effort':
      case '-e':
        result.effort = nextArg()
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

      case '--skip-memory':
        result.skipMemory = true
        break

      case '--skip-deploy':
        result.skipDeploy = true
        break

      case '--refine':
        result.refine = true
        break

      case '--mode':
      case '-M': {
        const val = nextArg()?.toLowerCase()
        if (val === RunMode.QUICK) result.mode = RunMode.QUICK
        else if (val === RunMode.FAST) result.mode = RunMode.FAST
        else if (val === RunMode.THINKING || val === 'default') result.mode = RunMode.THINKING
        else if (val === RunMode.DEEP_THINKING || val === 'deep_thinking' || val === 'slow') result.mode = RunMode.DEEP_THINKING
        break
      }

      case '--complexity':
      case '-c': {
        const val = nextArg()?.toUpperCase()
        if (val === Complexity.LOW) result.complexity = Complexity.LOW
        else if (val === Complexity.HIGH) result.complexity = Complexity.HIGH
        else if (val === Complexity.AUTO) result.complexity = Complexity.AUTO
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
