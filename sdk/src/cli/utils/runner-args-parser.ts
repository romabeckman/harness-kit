export interface StandardRunnerArgs {
  agentType?: string
  model?: string
  effort?: string
  debug?: boolean
  restArgs: string[]
}

/**
 * Extracts standard runner options (--agent, -a, --model, -m, --effort, -e, --debug)
 * and preserves any remaining command-specific arguments in `restArgs`.
 */
export function parseStandardRunnerArgs(args: string[]): StandardRunnerArgs {
  const result: StandardRunnerArgs = {
    restArgs: [],
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

    if (arg === '--agent' || arg === '-a') {
      result.agentType = nextArg()
    } else if (arg === '--model' || arg === '-m') {
      result.model = nextArg()
    } else if (arg === '--effort' || arg === '-e') {
      result.effort = nextArg()
    } else if (arg === '--debug') {
      result.debug = true
    } else {
      result.restArgs.push(currentArg)
    }
  }

  return result
}
