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
import type { QaCliOptions, QaCommandDependencies, QaReportOutput } from './qa/types'
import { QaAuthConfigStore } from '../../qa/auth/QaAuthConfigStore'
import { runQaAuthCommand } from './qa/QaAuthCommand'
import { renderQaReportOutput } from './qa/QaReportOutput'

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

async function resolveAuthProfile(workspace: string, authProfile?: string): Promise<string | undefined> {
  if (authProfile !== undefined) return authProfile
  const profiles = new QaAuthConfigStore(workspace).describe()
  if (profiles.length === 0) return undefined
  const { select } = await import('@inquirer/prompts')
  return select({
    message: 'QA authentication profile:',
    choices: [
      { name: 'none — run anonymously', value: undefined },
      ...profiles.map((profile) => ({ name: `${profile.name} — ${profile.mode}`, value: profile.name })),
    ],
  })
}

async function selectSavedPlanAction(analysisEnabled: boolean): Promise<'resume' | 'resume-with-analysis' | 'new'> {
  const { select } = await import('@inquirer/prompts')
  const choices = [
    {
      name: 'resume — execute the saved QA plan',
      value: 'resume' as const,
      description: analysisEnabled
        ? 'Run saved scenarios and inspect evidence because --analysis is enabled.'
        : 'Run saved scenarios only. Do not inspect evidence for additional scenarios.',
    },
    ...(!analysisEnabled ? [{
      name: 'resume with analysis — extend coverage when needed',
      value: 'resume-with-analysis' as const,
      description: 'Run saved scenarios, inspect evidence, then add and execute new scenarios for material gaps before reporting.',
    }] : []),
    {
      name: 'new — create a new QA plan',
      value: 'new' as const,
      description: 'Create a new plan from the scope and supplied scenarios.',
    },
  ]
  return select({
    message: 'A saved QA plan exists. What would you like to do?',
    choices,
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

async function selectReportOutput(): Promise<QaReportOutput> {
  const { select } = await import('@inquirer/prompts')
  return select({
    message: 'Select the report output format:',
    choices: [
      { name: 'JSON — structured report', value: 'json' },
      { name: 'HTML — styled scenario table', value: 'html' },
      { name: 'Markdown — organized error scenarios', value: 'markdown' },
      { name: 'Send to developer — LLM-generated fix scope', value: 'send-to-developer' },
    ],
    default: 'json',
  })
}

export async function cmdQa(cwd: string, args: string[], dependencies: QaCommandDependencies = {}): Promise<void> {
  const explicitAction = args[0] && !args[0].startsWith('-')
  const options = parseQaArgs(args)
  if (options.debug) DebugContext.enable()
  const workspace = resolve(cwd, options.projectPath ?? '.')
  if (options.action === 'auth') {
    await runQaAuthCommand(workspace)
    return
  }
  options.authProfile = await resolveAuthProfile(workspace, options.authProfile)

  if (options.action === 'exploratory') {
    await runQaExploratoryCommand(workspace, options, dependencies)
    return
  }

  if (!explicitAction && options.action === 'run' && options.scope === undefined && options.scenarios.length === 0) {
    const store = new QaRunStore(workspace)
    const savedPlans = store.listPlans()
    const savedPlanAction = savedPlans.length > 0 ? await selectSavedPlanAction(options.analysis === true) : 'new'
    if (savedPlans.length > 0 && (savedPlanAction === 'resume' || savedPlanAction === 'resume-with-analysis')) {
      options.analysis = options.analysis || savedPlanAction === 'resume-with-analysis'
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
    const request = { scope, scenarios: options.scenarios, target: profile === 'cli' ? resolve(workspace, target || '.') : target, profile, authProfile: options.authProfile }
    view.start(request, workspace)
    const report = await createQaOrchestrator(workspace, options, dependencies, (event) => view.onProgress(event)).run(request)
    if (options.report) view.renderReport(report)
    await offerDevelopmentRenewal(workspace, options, dependencies, report)
    return
  }

  const store = new QaRunStore(workspace)
  const run = options.runId ? store.loadRun(options.runId) : await selectCompletedRun(store)
  if (!run.completedAt || !run.verdict) throw new Error(`QA run is not completed: ${run.id}`)
  options.output ??= await selectReportOutput()
  const plan = store.loadPlan(run.planId, run.planVersion)
  const orchestrator = createQaOrchestrator(workspace, options, dependencies, undefined, store)
  if (options.output === 'send-to-developer') {
    const markdown = await orchestrator.developerReport(plan, run)
    store.saveDeveloperReport(run.id, markdown)
    console.log(`QA developer scope written to ${store.developerReportPath(run.id)}`)
    return
  }
  const report = orchestrator.executionSummary(plan, run)
  const output = renderQaReportOutput(options.output, plan, run, report)
  const outputPath = options.output === 'html'
    ? store.reportHtmlPath(run.id)
    : options.output === 'markdown'
      ? store.reportMarkdownPath(run.id)
      : store.reportPath(run.id)
  if (options.output === 'html') store.saveReportHtml(run.id, output)
  else if (options.output === 'markdown') store.saveReportMarkdown(run.id, output)
  else store.saveReport(report)
  console.log(`QA ${options.output} report written to ${outputPath}`)
}
