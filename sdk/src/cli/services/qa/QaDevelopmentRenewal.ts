import type { QaFinalReport, QaPlan, QaRun, QaScenarioResult } from '../../../qa/types'
import { QaRunStore } from '../../../qa/services/QaRunStore'
import type { ConfirmOptions, DevelopmentMode, QaCliOptions, QaCommandDependencies, SelectModeOptions } from './types'

export async function offerDevelopmentRenewal(
  workspace: string,
  options: QaCliOptions,
  dependencies: QaCommandDependencies,
  report: QaFinalReport,
): Promise<void> {
  const store = new QaRunStore(workspace)
  const run = store.loadRun(report.runId)
  const actionableResults = run.results.filter(isActionableResult)
  if (actionableResults.length === 0) return

  const shouldSend = dependencies.confirmSendToFix
    ? await dependencies.confirmSendToFix({ message: 'Send failed and blocked scenarios to fix?', default: false })
    : await confirmDevelopmentRenewal()
  if (!shouldSend) return

  const plan = store.loadPlan(run.planId, run.planVersion)
  const confirmOption = dependencies.confirmDevelopmentOption ?? confirmPrompt
  const selectMode = dependencies.selectDevelopmentMode ?? selectModePrompt
  const keepModel = options.model
    ? await confirmOption({ message: `Keep model "${options.model}"?`, default: true })
    : false
  const keepEffort = options.effort
    ? await confirmOption({ message: `Keep effort "${options.effort}"?`, default: true })
    : false
  const runDeploy = await confirmOption({ message: 'Run deploy?', default: true })
  const mode = await selectMode({
    message: 'Select development mode:',
    choices: [
      { name: 'quick', value: 'quick', description: 'Low complexity; skip Review and Memory' },
      { name: 'fast', value: 'fast', description: 'Low complexity; run Review and Memory' },
      { name: 'thinking', value: 'thinking', description: 'Automatic complexity; full pipeline' },
      { name: 'deep thinking', value: 'deep_thinking', description: 'High complexity; refinement and full pipeline' },
    ],
    default: 'quick',
  })
  const runArgs = [
    '--reset',
    '--mode', mode,
    '--scope', buildDevelopmentScope(plan, run, actionableResults),
    '--path', workspace,
  ]
  if (options.agentType) runArgs.push('--agent', options.agentType)
  if (keepModel && options.model) runArgs.push('--model', options.model)
  if (keepEffort && options.effort) runArgs.push('--effort', options.effort)
  if (!runDeploy) runArgs.push('--skip-deploy')
  if (options.debug) runArgs.push('--debug')

  const runCommand = dependencies.runCommand ?? (await import('../run-service.js')).cmdRun
  await runCommand(workspace, runArgs)
}

function isActionableResult(result: QaScenarioResult): boolean {
  return result.status === 'FAILED' || result.status === 'BLOCKED'
}

async function confirmDevelopmentRenewal(): Promise<boolean> {
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY && process.env.NODE_ENV !== 'test'
  if (!isInteractive) return false
  const { confirm } = await import('@inquirer/prompts')
  return confirm({ message: 'Send failed and blocked scenarios to fix?', default: false })
}

async function confirmPrompt(options: ConfirmOptions): Promise<boolean> {
  const { confirm } = await import('@inquirer/prompts')
  return confirm(options)
}

async function selectModePrompt(options: SelectModeOptions): Promise<DevelopmentMode> {
  const { select } = await import('@inquirer/prompts')
  return select(options)
}

function buildDevelopmentScope(plan: QaPlan, run: QaRun, results: QaScenarioResult[]): string {
  const scenarios = new Map(plan.scenarios.map((scenario) => [scenario.id, scenario]))
  return [
    `Renew development from QA run ${run.id}.`,
    'Fix only the FAILED and BLOCKED scenarios listed below. Preserve unrelated behavior.',
    ...results.flatMap((result) => {
      const scenario = scenarios.get(result.scenarioId)
      return [
        '',
        `## ${result.status}: ${result.scenarioId}`,
        `Scenario: ${scenario?.description ?? result.scenarioId}`,
        `Definition: ${scenario ? JSON.stringify(scenario) : 'Unavailable'}`,
        `Observed: ${result.reason ?? result.status}`,
        `Evidence: ${result.evidence.length > 0 ? result.evidence.map((evidence) => evidence.path).join(', ') : 'None'}`,
      ]
    }),
  ].join('\n')
}
