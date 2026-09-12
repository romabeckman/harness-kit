import { AgentRunnerFactory } from '../../../agent-runner/AgentRunnerFactory'
import { Runner } from '../../../agent-runner/types'
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
