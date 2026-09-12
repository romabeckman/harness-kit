import { resolve } from 'node:path'
import { AgentRunnerFactory } from '../../agent-runner/AgentRunnerFactory'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import { Runner } from '../../agent-runner/types'
import { QaAgenticOrchestrator } from '../../qa/QaAgenticOrchestrator'
import type { QaDriver, QaFinalReport, QaPlan, QaProfile, QaRun } from '../../qa/types'
import type { QaProgressListener, QaTerminalPresenter } from '../../qa/progress'
import type { QaRuntimePreparer } from '../../qa/services/QaRuntimeManager'
import { QaRunStore } from '../../qa/services/QaRunStore'
import type { QaTargetProbe } from '../../qa/services/QaTargetProbe'
import { QaTerminalView } from '../../qa/ui/QaTerminalView'
import { HarnessSettings } from '../../settings/HarnessSettings'
import { DebugContext } from '../DebugContext'
import { validateScope } from '../utils/cli-utils'
import { HELP_QA } from '../utils/constants'

export type QaAction = 'run' | 'report'

export interface QaCliOptions {
  action: QaAction
  runId?: string
  target?: string
  profile?: QaProfile
  scope?: string
  scenarios: string[]
  projectPath?: string
  agentType?: string
  model?: string
  effort?: string
  debug?: boolean
  report: boolean
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
  const actions: QaAction[] = ['run', 'report']
  const first = args[0]
  const hasAction = actions.includes(first as QaAction)
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
      if (!['api', 'web', 'web-game', 'mobile-web', 'accessibility', 'mcp', 'cli', 'websocket', 'security', 'full'].includes(value)) throw new Error(`Invalid QA profile: ${value}`)
      options.profile = value as QaProfile
    } else if (flag === '--scope' || flag === '--objective') options.scope = value
    else if (flag === '--scenario') options.scenarios.push(value)
    else if (flag === '--project') options.projectPath = value
    else if (flag === '--agent') options.agentType = value
    else if (flag === '--model') options.model = value
    else if (flag === '--effort') options.effort = value
    else throw new Error(`Unknown QA option: ${flag}`)
  }

  if (options.action === 'run' && options.runId) throw new Error('--run is only valid with hrns qa report')
  if (options.action === 'report' && options.report) throw new Error('--report is only valid with hrns qa run')
  return options
}

async function resolveScope(scope?: string): Promise<string> {
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
    : editor({ message: 'Paste or write your QA scope (save and close to continue):', validate: validateScope })
}

async function resolveProfile(profile?: QaProfile): Promise<QaProfile | undefined> {
  if (profile !== undefined) return profile
  const { select } = await import('@inquirer/prompts')
  return select({
    message: 'QA test profile:',
    choices: [
      { name: 'Auto — infer from scope and project', value: undefined },
      ...(['api', 'web', 'web-game', 'mobile-web', 'accessibility', 'mcp', 'cli', 'websocket', 'security', 'full'] as QaProfile[])
        .map((value) => ({ name: value, value })),
    ],
  })
}

function validateTarget(value: string, profile?: QaProfile): true | string {
  if (!value.trim() || profile === 'cli') return true
  try {
    const url = new URL(value)
    const protocols = profile === 'websocket' ? ['ws:', 'wss:'] : profile ? ['http:', 'https:'] : ['http:', 'https:', 'ws:', 'wss:']
    if (protocols.includes(url.protocol) && url.hostname && !url.username && !url.password) return true
  } catch { /* Return the same actionable form error for malformed URLs. */ }
  return profile === 'websocket' ? 'Enter a ws:// or wss:// URL without credentials.' : 'Enter a valid target URL without embedded credentials.'
}

async function resolveTarget(target?: string, profile?: QaProfile): Promise<string | undefined> {
  if (target !== undefined) return target
  const { input } = await import('@inquirer/prompts')
  const value = await input({
    message: profile === 'cli' ? 'CLI working directory (optional):' : 'Target application URL (optional):',
    validate: (value) => validateTarget(value, profile),
  })
  return value.trim() || undefined
}

async function selectSavedPlanAction(): Promise<'resume' | 'new'> {
  const { select } = await import('@inquirer/prompts')
  return select({
    message: 'A saved QA plan exists. What would you like to do?',
    choices: [
      { name: 'resume — execute the saved QA plan', value: 'resume' },
      { name: 'new — create a new QA plan', value: 'new' },
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

async function selectCompletedRun(store: QaRunStore): Promise<QaRun> {
  const runs = store.listCompletedRuns()
  if (runs.length === 0) throw new Error('No completed QA runs available. Run "hrns qa run" first.')
  const { select } = await import('@inquirer/prompts')
  const runId = await select({
    message: 'Select the QA run to report:',
    choices: runs.map((run) => ({
      name: `${run.id} — ${run.verdict} — ${run.completedAt}`,
      value: run.id,
    })),
  })
  const run = runs.find((candidate) => candidate.id === runId)
  if (!run) throw new Error('Selected QA run is no longer available')
  return run
}

export async function cmdQa(cwd: string, args: string[], dependencies: QaCommandDependencies = {}): Promise<void> {
  const explicitAction = args[0] && !args[0].startsWith('-')
  const options = parseQaArgs(args)
  if (options.debug) DebugContext.enable()
  const workspace = resolve(cwd, options.projectPath ?? '.')

  if (!explicitAction && options.action === 'run' && options.scope === undefined && options.scenarios.length === 0) {
    const store = new QaRunStore(workspace)
    const savedPlans = store.listPlans()
    if (savedPlans.length > 0 && await selectSavedPlanAction() === 'resume') {
      const savedPlan = await selectSavedPlan(savedPlans)
      const view = dependencies.view ?? new QaTerminalView()
      view.start({ target: savedPlan.target, profile: savedPlan.profile }, workspace)
      const report = await createOrchestrator(workspace, options, dependencies, (event) => view.onProgress(event), store).resume(savedPlan)
      if (options.report) view.renderReport(report)
      return
    }
  }

  if (options.action === 'run') {
    const scope = await resolveScope(options.scope)
    if (!scope.trim()) throw new Error('QA scope must not be empty')
    const profile = options.scope === undefined ? await resolveProfile(options.profile) : options.profile
    const target = options.scope === undefined ? await resolveTarget(options.target, profile) : options.target
    const targetValidation = validateTarget(target ?? '', profile)
    if (targetValidation !== true) throw new Error(targetValidation)
    const view = dependencies.view ?? new QaTerminalView()
    const request = { scope, scenarios: options.scenarios, target: profile === 'cli' ? resolve(workspace, target || '.') : target, profile }
    view.start(request, workspace)
    const report = await createOrchestrator(workspace, options, dependencies, (event) => view.onProgress(event)).run(request)
    if (options.report) view.renderReport(report)
    return
  }

  const store = new QaRunStore(workspace)
  const run = options.runId ? store.loadRun(options.runId) : await selectCompletedRun(store)
  if (!run.completedAt || !run.verdict) throw new Error(`QA run is not completed: ${run.id}`)
  const report = await generateRunReport(workspace, options, dependencies, store, run)
  console.log(JSON.stringify(report, null, 2))
}

function createOrchestrator(
  workspace: string,
  options: QaCliOptions,
  dependencies: QaCommandDependencies,
  onProgress?: QaProgressListener,
  store?: QaRunStore,
): QaAgenticOrchestrator {
  const runner = dependencies.runner ?? AgentRunnerFactory.create({
    type: options.agentType ?? Runner.CLAUDE_CLI,
    model: options.model,
    effort: options.effort,
  })
  const settings = dependencies.settings ?? HarnessSettings.load(workspace)
  return new QaAgenticOrchestrator({
    workspace,
    runner,
    store,
    drivers: dependencies.drivers,
    settings,
    model: options.model,
    effort: options.effort,
    report: options.report,
    onProgress,
    targetProbe: dependencies.targetProbe,
    runtime: dependencies.runtime,
  })
}

async function generateRunReport(
  workspace: string,
  options: QaCliOptions,
  dependencies: QaCommandDependencies,
  store: QaRunStore,
  run: QaRun,
): Promise<QaFinalReport> {
  const plan = store.loadPlan(run.planId, run.planVersion)
  return createOrchestrator(workspace, options, dependencies, undefined, store).report(plan, run)
}
