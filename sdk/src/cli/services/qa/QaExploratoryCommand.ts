import { QaExploratoryService } from '../../../qa/services/QaExploratoryService'
import { QaRunStore } from '../../../qa/services/QaRunStore'
import type { QaCliOptions, QaCommandDependencies } from './types'

export async function runQaExploratoryCommand(
  workspace: string,
  options: QaCliOptions,
  dependencies: QaCommandDependencies,
): Promise<void> {
  const store = new QaRunStore(workspace)
  const report = await new QaExploratoryService(
    workspace,
    store,
    dependencies.drivers,
    dependencies.targetProbe,
  ).execute({ target: options.target, authProfile: options.authProfile, onProgress: dependencies.view ? (event) => dependencies.view!.onProgress(event) : undefined })
  console.log(JSON.stringify(report, null, 2))
}
