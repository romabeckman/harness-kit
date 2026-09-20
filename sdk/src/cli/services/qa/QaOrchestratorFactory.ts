import { AgentRunnerFactory } from '../../../agent-runner/AgentRunnerFactory'
import { QaAgenticOrchestrator } from '../../../qa/QaAgenticOrchestrator'
import type { QaProgressListener } from '../../../qa/progress'
import { QaRunStore } from '../../../qa/services/QaRunStore'
import { HarnessSettings } from '../../../settings/HarnessSettings'
import type { QaCliOptions, QaCommandDependencies } from './types'

export function createQaOrchestrator(
  workspace: string,
  options: QaCliOptions,
  dependencies: QaCommandDependencies,
  onProgress?: QaProgressListener,
  store?: QaRunStore,
): QaAgenticOrchestrator {
  if (!dependencies.runner && !options.agentType) {
    throw new Error('An agent runner must be selected before creating the QA orchestrator.')
  }
  const runner = dependencies.runner ?? AgentRunnerFactory.create({
    type: options.agentType!,
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
    analysis: options.analysis,
    onProgress,
    targetProbe: dependencies.targetProbe,
    runtime: dependencies.runtime,
    authProfile: options.authProfile,
  })
}
