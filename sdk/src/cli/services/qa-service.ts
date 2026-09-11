import { QaRunStore } from '../../qa/QaRunStore'
import { QaService } from '../../qa/QaService'
import type { QaHttpRequest, QaPlan, QaProfile } from '../../qa/types'
import { HELP_QA } from '../utils/constants'

export type QaAction = 'plan' | 'execute' | 'run' | 'report' | 'doctor'

export interface QaCliOptions {
  action: QaAction
  planId?: string
  version?: number
  runId?: string
  target?: string
  profile: QaProfile
  criteria: string[]
  request?: QaHttpRequest
}

export function parseQaArgs(args: string[]): QaCliOptions {
  const action = args[0] as QaAction | undefined
  if (!action || !['plan', 'execute', 'run', 'report', 'doctor'].includes(action)) {
    throw new Error(`QA action required.\n${HELP_QA}`)
  }
  const options: QaCliOptions = { action, profile: 'api', criteria: [] }
  for (let index = 1; index < args.length; index++) {
    const argument = args[index]
    const [flag, inlineValue] = argument.split('=', 2)
    const value = inlineValue ?? args[++index]
    if (flag === '--plan') {
      const [planId, version] = value.split('@', 2)
      options.planId = planId
      if (version !== undefined) options.version = Number.parseInt(version, 10)
    } else if (flag === '--run') {
      options.runId = value
    } else if (flag === '--target') {
      options.target = value
    } else if (flag === '--profile') {
      if (value !== 'api' && value !== 'web' && value !== 'web-game') throw new Error(`Invalid QA profile: ${value}`)
      options.profile = value
    } else if (flag === '--criterion') {
      options.criteria.push(value)
    } else if (flag === '--method') {
      options.request = { method: value, path: options.request?.path ?? '', expectedStatus: options.request?.expectedStatus ?? 200 }
    } else if (flag === '--path') {
      options.request = { method: options.request?.method ?? 'GET', path: value, expectedStatus: options.request?.expectedStatus ?? 200 }
    } else if (flag === '--expect-status') {
      const expectedStatus = Number.parseInt(value, 10)
      if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) throw new Error(`Invalid expected HTTP status: ${value}`)
      options.request = { method: options.request?.method ?? 'GET', path: options.request?.path ?? '', expectedStatus }
    } else if (flag === '--help' || flag === '-h') {
      throw new Error(HELP_QA)
    } else {
      throw new Error(`Unknown QA option: ${flag}`)
    }
  }
  return options
}

export async function cmdQa(cwd: string, args: string[]): Promise<void> {
  const options = parseQaArgs(args)
  const store = new QaRunStore(cwd)
  const service = new QaService(store)
  if (options.action === 'plan') {
    const plan = service.plan(planInput(options))
    console.log(`QA plan saved: ${plan.id}@${plan.version}`)
    return
  }
  if (options.action === 'execute') {
    const run = await service.execute(loadPlan(store, options))
    console.log(`QA run completed: ${run.id} (${run.verdict})`)
    return
  }
  if (options.action === 'run') {
    const plan = service.plan(planInput(options))
    const run = await service.execute(plan)
    console.log(`QA run completed: ${run.id} (${run.verdict})`)
    return
  }
  if (options.action === 'report') {
    if (!options.runId) throw new Error('QA report requires --run <id>')
    console.log(JSON.stringify(store.loadRun(options.runId), null, 2))
    return
  }
  const availability = await service.doctor(options.profile)
  console.log(JSON.stringify({ profile: options.profile, ...availability }, null, 2))
}

function planInput(options: QaCliOptions): { planId: string; target: string; criteria: string[]; profile: QaProfile; requests?: QaHttpRequest[] } {
  if (!options.planId || !options.target || options.criteria.length === 0) {
    throw new Error('QA plan requires --plan <id>, --target <url>, and one or more --criterion values')
  }
  if (options.request && !options.request.path) throw new Error('QA API request requires --path <path>')
  return { planId: options.planId, target: options.target, criteria: options.criteria, profile: options.profile, requests: options.request ? [options.request] : undefined }
}

function loadPlan(store: QaRunStore, options: QaCliOptions): QaPlan {
  if (!options.planId) throw new Error('QA execute requires --plan <id>@<version>')
  return store.loadPlan(options.planId, options.version ?? 1)
}
