import { QaRunStore } from '../../qa/services/QaRunStore'
import { QaService } from '../../qa/services/QaService'
import { QaAgenticOrchestrator } from '../../qa/QaAgenticOrchestrator'
import { AgentRunnerFactory } from '../../agent-runner/AgentRunnerFactory'
import { Runner } from '../../agent-runner/types'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { QaDriver, QaHttpRequest, QaPlan, QaProfile } from '../../qa/types'
import { HELP_QA } from '../utils/constants'
import { resolve } from 'node:path'
import { HarnessSettings } from '../../settings/HarnessSettings'
import { QaTerminalView } from '../../qa/ui/QaTerminalView'
import type { QaTerminalPresenter } from '../../qa/progress'
import { DebugContext } from '../DebugContext'
import type { QaTargetProbe } from '../../qa/services/QaTargetProbe'
import type { QaRuntimePreparer } from '../../qa/services/QaRuntimeManager'
import { validateScope } from '../utils/cli-utils'

export type QaAction = 'agentic' | 'plan' | 'execute' | 'renew' | 'resume' | 'run' | 'report' | 'doctor'

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
  debug?: boolean
  request?: QaHttpRequest
}

export interface QaCommandDependencies {
  runner?: IAgentRunner
  drivers?: QaDriver[]
  settings?: HarnessSettings
  view?: QaTerminalPresenter
  targetProbe?: QaTargetProbe
  runtime?: QaRuntimePreparer
}

export function parseQaArgs(args: string[]): QaCliOptions {
  const actions: QaAction[] = ['agentic', 'plan', 'execute', 'renew', 'resume', 'run', 'report', 'doctor']
  const first = args[0]
  const hasAction = actions.includes(first as QaAction)
  if (first && !hasAction && !first.startsWith('-')) throw new Error(`Unknown QA action: ${first}\n${HELP_QA}`)
  const options: QaCliOptions = { action: hasAction ? first as QaAction : 'agentic', criteria: [], scenarios: [] }
  for (let index = hasAction ? 1 : 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--debug') {
      options.debug = true
      continue
    }
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
      if (!['api', 'web', 'web-game', 'mobile-web', 'accessibility', 'mcp', 'cli', 'websocket', 'security', 'full'].includes(value)) throw new Error(`Invalid QA profile: ${value}`)
      options.profile = value as QaProfile
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

async function resolveAgenticScope(scope?: string): Promise<string> {
  if (scope !== undefined) return scope

  const { editor, input, select } = await import('@inquirer/prompts')
  const inputMethod = await select({
    message: 'How would you like to provide the QA scope?',
    choices: [
      { name: 'type   — enter a short description', value: 'type' },
      { name: 'editor — open editor for a longer description', value: 'editor' },
    ],
  })

  return inputMethod === 'type'
    ? input({ message: 'QA scope:', validate: validateScope })
    : editor({
      message: 'Paste or write your QA scope (save and close to continue):',
      validate: validateScope,
    })
}

async function selectSavedPlanAction(): Promise<'resume' | 'renew'> {
  const { select } = await import('@inquirer/prompts')
  return select({
    message: 'A saved QA plan exists. What would you like to do?',
    choices: [
      { name: 'resume — execute the saved QA plan', value: 'resume' },
      { name: 'renew  — create a new agentic QA plan', value: 'renew' },
    ],
  })
}

async function selectSavedPlan(plans: QaPlan[]): Promise<QaPlan> {
  const { select } = await import('@inquirer/prompts')
  const selected = await select({
    message: 'Select the QA plan to resume:',
    choices: plans.map((plan) => ({
      name: `${plan.id}@${plan.version} — ${plan.criteria[0] ?? plan.profile}`,
      value: `${plan.id}@${plan.version}`,
    })),
  })
  const plan = plans.find((candidate) => `${candidate.id}@${candidate.version}` === selected)
  if (!plan) throw new Error('Selected QA plan is no longer available')
  return plan
}

export async function cmdQa(cwd: string, args: string[], dependencies: QaCommandDependencies = {}): Promise<void> {
  const explicitAction = args[0] && !args[0].startsWith('-')
  const options = parseQaArgs(args)
  if (options.debug) DebugContext.enable()
  const workspace = resolve(cwd, options.projectPath ?? '.')
  if (!explicitAction && options.action === 'agentic' && options.scope === undefined && options.scenarios.length === 0) {
    const store = new QaRunStore(workspace)
    const savedPlans = store.listPlans()
    if (savedPlans.length > 0 && await selectSavedPlanAction() === 'resume') {
      const savedPlan = await selectSavedPlan(savedPlans)
      const runner = dependencies.runner ?? AgentRunnerFactory.create({
        type: options.agentType ?? Runner.CLAUDE_CLI,
        model: options.model,
        effort: options.effort,
      })
      const settings = dependencies.settings ?? HarnessSettings.load(workspace)
      const view = dependencies.view ?? new QaTerminalView()
      view.start({ target: savedPlan.target, profile: savedPlan.profile }, workspace)
      const report = await new QaAgenticOrchestrator({
        workspace,
        runner,
        drivers: dependencies.drivers,
        settings,
        model: options.model,
        effort: options.effort,
        onProgress: (event) => view.onProgress(event),
        targetProbe: dependencies.targetProbe,
        runtime: dependencies.runtime,
      }).resume(savedPlan)
      view.renderReport(report)
      return
    }
  }
  if (options.action === 'agentic') {
    options.scope = await resolveAgenticScope(options.scope)
    const runner = dependencies.runner ?? AgentRunnerFactory.create({
      type: options.agentType ?? Runner.CLAUDE_CLI,
      model: options.model,
      effort: options.effort,
    })
    const settings = dependencies.settings ?? HarnessSettings.load(workspace)
    const view = dependencies.view ?? new QaTerminalView()
    const request = {
      scope: options.scope,
      scenarios: options.scenarios,
      target: options.target,
      profile: options.profile,
    }
    view.start(request, workspace)
    const report = await new QaAgenticOrchestrator({
      workspace,
      runner,
      drivers: dependencies.drivers,
      settings,
      model: options.model,
      effort: options.effort,
      onProgress: (event) => view.onProgress(event),
      targetProbe: dependencies.targetProbe,
      runtime: dependencies.runtime,
    }).run(request)
    view.renderReport(report)
    return
  }
  const store = new QaRunStore(workspace)
  const service = new QaService(store, dependencies.drivers, dependencies.targetProbe)
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
  if (options.action === 'renew') {
    const plan = loadPlan(store, options, 'renew')
    const run = await service.execute(plan)
    console.log(`QA plan renewed: ${plan.id}@${plan.version} as ${run.id} (${run.verdict})`)
    return
  }
  if (options.action === 'resume') {
    if (!options.runId) throw new Error('QA resume requires --run <id>')
    const run = store.loadRun(options.runId)
    const plan = store.loadPlan(run.planId, run.planVersion)
    const completedScenarioIds = new Set(run.results.map((result) => result.scenarioId))
    const pendingScenarios = plan.scenarios.filter((scenario) => !completedScenarioIds.has(scenario.id))
    if (pendingScenarios.length === 0) {
      throw new Error(`QA run has no unfinished scenarios. Use renew --plan ${plan.id}@${plan.version}`)
    }
    const resumed = await service.continue(run, plan, pendingScenarios)
    console.log(`QA run resumed: ${resumed.id} (${resumed.verdict})`)
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

function loadPlan(store: QaRunStore, options: QaCliOptions, action: 'execute' | 'renew' = 'execute'): QaPlan {
  if (!options.planId) throw new Error(`QA ${action} requires --plan <id>@<version>`)
  return store.loadPlan(options.planId, options.version ?? 1)
}
