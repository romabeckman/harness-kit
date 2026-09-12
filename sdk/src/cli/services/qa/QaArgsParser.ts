import type { QaAction, QaCliOptions } from './types'
import type { QaProfile } from '../../../qa/types'
import { HELP_QA } from '../../utils/constants'

const ACTIONS: QaAction[] = ['run', 'report', 'exploratory']
const PROFILES: QaProfile[] = ['api', 'web', 'web-game', 'mobile-web', 'accessibility', 'mcp', 'cli', 'websocket', 'security', 'full']

export function parseQaArgs(args: string[]): QaCliOptions {
  const first = args[0]
  const hasAction = ACTIONS.includes(first as QaAction)
  if (first && !hasAction && !first.startsWith('-')) throw new Error(`Unknown QA action: ${first}\n${HELP_QA}`)
  const options: QaCliOptions = { action: hasAction ? first as QaAction : 'run', scenarios: [], report: false }

  for (let index = hasAction ? 1 : 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--debug') {
      options.debug = true
      continue
    }
    if (argument === '--report') {
      options.report = true
      continue
    }
    if (argument === '--help' || argument === '-h') throw new Error(HELP_QA)

    const separator = argument.indexOf('=')
    const flag = separator < 0 ? argument : argument.slice(0, separator)
    const inlineValue = separator < 0 ? undefined : argument.slice(separator + 1)
    const value = inlineValue ?? args[++index]
    if (value === undefined || value.startsWith('--')) throw new Error(`QA option requires a value: ${flag}`)
    if (flag === '--run') options.runId = value
    else if (flag === '--target') options.target = value
    else if (flag === '--profile') {
      if (!PROFILES.includes(value as QaProfile)) throw new Error(`Invalid QA profile: ${value}`)
      options.profile = value as QaProfile
    } else if (flag === '--scope' || flag === '--objective') options.scope = value
    else if (flag === '--scenario') options.scenarios.push(value)
    else if (flag === '--project') options.projectPath = value
    else if (flag === '--agent') options.agentType = value
    else if (flag === '--model') options.model = value
    else if (flag === '--effort') options.effort = value
    else if (flag === '--auth') options.authProfile = value
    else throw new Error(`Unknown QA option: ${flag}`)
  }

  if (options.action !== 'report' && options.runId) throw new Error('--run is only valid with hrns qa report')
  if (options.action !== 'run' && options.report) throw new Error('--report is only valid with hrns qa run')
  if (options.action !== 'run' && options.scope !== undefined) throw new Error('--scope is only valid with hrns qa run')
  if (options.action !== 'run' && options.scenarios.length > 0) throw new Error('--scenario is only valid with hrns qa run')
  if (options.action === 'exploratory' && options.profile !== undefined) throw new Error('--profile is only valid with hrns qa run')
  return options
}
