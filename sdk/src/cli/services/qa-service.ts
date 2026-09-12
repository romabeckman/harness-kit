import { resolve } from 'node:path'
import type { QaFinalReport, QaPlan, QaProfile, QaRun } from '../../qa/types'
import { QaRunStore } from '../../qa/services/QaRunStore'
import { QaTerminalView } from '../../qa/ui/QaTerminalView'
import { DebugContext } from '../DebugContext'
import { validateScope } from '../utils/cli-utils'
import { parseQaArgs } from './qa/QaArgsParser'
import { runQaExploratoryCommand } from './qa/QaExploratoryCommand'
import { createQaOrchestrator } from './qa/QaOrchestratorFactory'
import { offerDevelopmentRenewal } from './qa/QaDevelopmentRenewal'
import type { QaCliOptions, QaCommandDependencies } from './qa/types'

export { parseQaArgs }
export type { QaAction, QaCliOptions, QaCommandDependencies } from './qa/types'

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

  if (options.action === 'exploratory') {
    await runQaExploratoryCommand(workspace, options, dependencies)
    return
  }

  if (!explicitAction && options.action === 'run' && options.scope === undefined && options.scenarios.length === 0) {
    const store = new QaRunStore(workspace)
    const savedPlans = store.listPlans()
    if (savedPlans.length > 0 && await selectSavedPlanAction() === 'resume') {
      const savedPlan = await selectSavedPlan(savedPlans)
      const view = dependencies.view ?? new QaTerminalView()
      view.start({ target: savedPlan.target, profile: savedPlan.profile }, workspace)
      const report = await createQaOrchestrator(workspace, options, dependencies, (event) => view.onProgress(event), store).resume(savedPlan)
      if (options.report) view.renderReport(report)
      await offerDevelopmentRenewal(workspace, options, dependencies, report)
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
    const report = await createQaOrchestrator(workspace, options, dependencies, (event) => view.onProgress(event)).run(request)
    if (options.report) view.renderReport(report)
    await offerDevelopmentRenewal(workspace, options, dependencies, report)
    return
  }

  const store = new QaRunStore(workspace)
  const run = options.runId ? store.loadRun(options.runId) : await selectCompletedRun(store)
  if (!run.completedAt || !run.verdict) throw new Error(`QA run is not completed: ${run.id}`)
  const report = await generateRunReport(workspace, options, dependencies, store, run)
  console.log(JSON.stringify(report, null, 2))
}

async function generateRunReport(
  workspace: string,
  options: QaCliOptions,
  dependencies: QaCommandDependencies,
  store: QaRunStore,
  run: QaRun,
): Promise<QaFinalReport> {
  const plan = store.loadPlan(run.planId, run.planVersion)
  return createQaOrchestrator(workspace, options, dependencies, undefined, store).report(plan, run)
}
