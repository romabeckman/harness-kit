import { QaRunStore } from '../../qa/QaRunStore'
import { QaService } from '../../qa/QaService'
import { QaAgenticOrchestrator } from '../../qa/QaAgenticOrchestrator'
import { AgentRunnerFactory } from '../../agent-runner/AgentRunnerFactory'
import { Runner } from '../../agent-runner/types'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { QaDriver, QaHttpRequest, QaPlan, QaProfile } from '../../qa/types'
import { HELP_QA } from '../utils/constants'
import { resolve } from 'node:path'
import { HarnessSettings } from '../../settings/HarnessSettings'

export type QaAction = 'agentic' | 'plan' | 'execute' | 'run' | 'report' | 'doctor'

export interface QaCliOptions {
  action: QaAction
  planId?: string
  version?: number
  runId?: string
  target?: string
  profile?: QaProfile
  criteria: string[]
  scope?: string
  scenarios: string[]
  projectPath?: string
  agentType?: string
  model?: string
  effort?: string
  request?: QaHttpRequest
}

export interface QaCommandDependencies {
  runner?: IAgentRunner
  drivers?: QaDriver[]
  settings?: HarnessSettings
}

export function parseQaArgs(args: string[]): QaCliOptions {
  const actions: QaAction[] = ['agentic', 'plan', 'execute', 'run', 'report', 'doctor']
  const first = args[0]
  const hasAction = actions.includes(first as QaAction)
  if (first && !hasAction && !first.startsWith('-')) throw new Error(`Unknown QA action: ${first}\n${HELP_QA}`)
  const options: QaCliOptions = { action: hasAction ? first as QaAction : 'agentic', criteria: [], scenarios: [] }
  for (let index = hasAction ? 1 : 0; index < args.length; index++) {
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
    } else if (flag === '--scope' || flag === '--objective') {
      options.scope = value
    } else if (flag === '--scenario') {
      options.scenarios.push(value)
    } else if (flag === '--project') {
      options.projectPath = value
    } else if (flag === '--agent') {
      options.agentType = value
    } else if (flag === '--model') {
      options.model = value
    } else if (flag === '--effort') {
      options.effort = value
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

export async function cmdQa(cwd: string, args: string[], dependencies: QaCommandDependencies = {}): Promise<void> {
  const options = parseQaArgs(args)
  if (options.action === 'agentic') {
    if (!options.scope && options.scenarios.length === 0) throw new Error('Agentic QA requires --scope <text> or one or more --scenario <text> values')
    const workspace = resolve(cwd, options.projectPath ?? '.')
    const runner = dependencies.runner ?? AgentRunnerFactory.create({
      type: options.agentType ?? Runner.CLAUDE_CLI,
      model: options.model,
      effort: options.effort,
    })
    const settings = dependencies.settings ?? HarnessSettings.load(workspace)
    const report = await new QaAgenticOrchestrator({
      workspace,
      runner,
      drivers: dependencies.drivers,
      settings,
      model: options.model,
      effort: options.effort,
    }).run({
      scope: options.scope,
      scenarios: options.scenarios,
      target: options.target,
      profile: options.profile,
    })
    console.log(JSON.stringify(report, null, 2))
    return
  }
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
  const profile = options.profile ?? 'api'
  const availability = await service.doctor(profile)
  console.log(JSON.stringify({ profile, ...availability }, null, 2))
}

function planInput(options: QaCliOptions): { planId: string; target: string; criteria: string[]; profile: QaProfile; requests?: QaHttpRequest[] } {
  if (!options.planId || !options.target || options.criteria.length === 0) {
    throw new Error('QA plan requires --plan <id>, --target <url>, and one or more --criterion values')
  }
  if (options.request && !options.request.path) throw new Error('QA API request requires --path <path>')
  return { planId: options.planId, target: options.target, criteria: options.criteria, profile: options.profile ?? 'api', requests: options.request ? [options.request] : undefined }
}

function loadPlan(store: QaRunStore, options: QaCliOptions): QaPlan {
  if (!options.planId) throw new Error('QA execute requires --plan <id>@<version>')
  return store.loadPlan(options.planId, options.version ?? 1)
}
