import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { JsonlSessionLedger } from '../../diagnose/JsonlSessionLedger'
import { TraceDirectoryScanner } from '../../diagnose/TraceDirectoryScanner'
import { SessionIdGenerator } from '../../diagnose/SessionIdGenerator'
import { MetaHarnessAgentAdapter } from '../../diagnose/MetaHarnessAgentAdapter'
import { DiagnoseService } from '../../diagnose/DiagnoseService'
import { DiagnoseReportRenderer } from '../../diagnose/DiagnoseReportRenderer'
import { DiagnosePaths } from '../../diagnose/utils/DiagnosePaths'
import type { DiagnoseSettings } from '../../diagnose/types'
import { isDiagnoseSession } from '../../diagnose/types'
import { AgentRunnerFactory } from '../../agent-runner/AgentRunnerFactory'
import { HarnessSettings } from '../../settings/HarnessSettings'
import { AnsiHelpers } from '../../ui/AnsiHelpers'
import { DebugContext } from '../DebugContext'
import { DreamingEpisodeStore } from '../../file-state/DreamingEpisodeStore'

import { parseStandardRunnerArgs } from '../utils/runner-args-parser'
import { selectAgentRunner } from '../utils/agent-selection'

export interface DiagnoseCliOptions {
  agentType?: string
  model?: string
  effort?: string
  batchSize?: number
  projectDreaming?: boolean
  dreamingProject?: string
  dreamingEpisode?: string
}

export function parseDiagnoseArgs(args: string[]): DiagnoseCliOptions {
  const runnerArgs = parseStandardRunnerArgs(args)
  if (runnerArgs.debug) {
    DebugContext.enable()
  }

  const result: DiagnoseCliOptions = {
    agentType: runnerArgs.agentType,
    model: runnerArgs.model,
    effort: runnerArgs.effort,
  }

  for (let i = 0; i < runnerArgs.restArgs.length; i++) {
    const currentArg = runnerArgs.restArgs[i]
    let arg: string
    let value: string | undefined

    const equalsIndex = currentArg.indexOf('=')
    if (currentArg.startsWith('--') && equalsIndex !== -1) {
      arg = currentArg.substring(0, equalsIndex)
      value = currentArg.substring(equalsIndex + 1)
    } else {
      arg = currentArg
    }

    const nextArg = () => (value !== undefined ? value : runnerArgs.restArgs[++i])

    if (arg === '--batch-size') {
      const val = nextArg()
      const parsed = parseInt(val, 10)
      if (!isNaN(parsed) && parsed > 0) {
        result.batchSize = parsed
      }
    }
    if (arg === '--project-dreaming' && (value === undefined || value === 'true')) result.projectDreaming = true
    if (arg === '--dreaming-project') result.dreamingProject = nextArg()
    if (arg === '--dreaming-episode') result.dreamingEpisode = nextArg()
  }

  return result
}

export async function cmdDiagnose(cwd: string, args: string[]): Promise<number> {
  const options = parseDiagnoseArgs(args)
  if (Boolean(options.dreamingProject) !== Boolean(options.dreamingEpisode)) {
    console.error('Use --dreaming-project and --dreaming-episode together.')
    return 1
  }
  if (options.dreamingProject) options.projectDreaming = true
  const ledgerPath = DiagnosePaths.ledgerPath(cwd)

  const ledger = new JsonlSessionLedger(ledgerPath)
  const pending = ledger.loadPending().filter(isDiagnoseSession)

  console.log(`\n── Harness Diagnose ────────────────────────────────────`)
  console.log(`  ledger:   docs/product/diagnose-sessions.jsonl`)
  console.log(`  pending:  ${pending.length} session(s)`)
  console.log(`────────────────────────────────────────────────────────\n`)

  const hasTraceHistory = pending.length === 0 && existsSync(DiagnosePaths.tracesDir(cwd))
    && ledger.loadAll().some(record => record.status === 'completed' && isDiagnoseSession(record))
  const dreamingStore = options.projectDreaming ? new DreamingEpisodeStore(cwd, DiagnosePaths.productDir(cwd)) : undefined
  if (pending.length === 0 && !hasTraceHistory && !dreamingStore?.list().some(episode => episode.closed)) {
    if (options.projectDreaming) console.log('No eligible project episodes found.')
    console.log(`${AnsiHelpers.green('✓')} No pending diagnose sessions found in docs/product/diagnose-sessions.jsonl`)
    return options.dreamingEpisode ? 1 : 0
  }

  options.agentType = await selectAgentRunner(options.agentType)

  const agentRunner = AgentRunnerFactory.create({
    type: options.agentType,
    model: options.model,
    effort: options.effort,
  })

  const scanner = new TraceDirectoryScanner(cwd)
  const idGenerator = new SessionIdGenerator(scanner)
  const agentAdapter = new MetaHarnessAgentAdapter({ agentRunner, workingDir: cwd })
  const settings = HarnessSettings.load(cwd)
  const cliSettings: DiagnoseSettings | undefined = (options.agentType || options.model || options.effort)
    ? {
        agent: options.agentType,
        model: options.model ?? '',
        effort: options.effort ?? '',
      }
    : undefined

  const service = new DiagnoseService({
    ledger,
    agentAdapter,
    idGenerator,
    settings,
    cliSettings,
    workingDir: cwd,
    ...(dreamingStore ? { dreaming: dreamingStore } : {}),
    ...(options.dreamingProject && options.dreamingEpisode ? { dreamingTarget: { project: options.dreamingProject, episodeId: options.dreamingEpisode } } : {}),
  })

  const batchSize = options.batchSize ?? 3
  const action = hasTraceHistory ? 'Analyzing existing trace history...' : `Processing sessions in batches of ${batchSize}...`
  console.log(`${AnsiHelpers.blue('►')} ${action}\n`)

  const result = await service.processAllPendingInBatches(batchSize, (batch) => {
    console.log(
      `${AnsiHelpers.green('✓')} Diagnose batch completed: ${batch.processed} processed, ${batch.remaining} remaining.`
    )
    return true
  })

  if (result.report) {
    DiagnoseReportRenderer.render(result.report)
  } else {
    console.log(`\n${AnsiHelpers.green('✔')} All diagnose batches completed (${result.processed} total sessions processed).\n`)
  }
  if (result.dreaming) {
    const { processed, pending } = result.dreaming
    console.log(`Project Dreaming: ${processed} processed, ${pending} pending.`)
    console.log(`  Created: ${result.dreaming.created ?? 0}; updated: ${result.dreaming.updated ?? 0}; no hypothesis: ${result.dreaming.noHypothesis ?? 0}; historical outcome unknown: ${result.dreaming.historicalUnknown ?? 0}.`)
    for (const detail of result.dreaming.decisions ?? []) {
      console.log(`  Episode ${detail.episodeId} (${detail.project}): ${detail.status} - ${detail.reason}`)
    }
    for (const detail of result.dreaming.pendingDetails ?? []) {
      console.error(`  Pending episode ${detail.episodeId} (${detail.project}) - ${detail.reason}`)
    }
    if (!result.dreaming.eligible) {
      console.log('No eligible project episodes found.')
    }
  }
  return result.dreaming?.pending || (options.dreamingEpisode && !result.dreaming?.eligible) ? 1 : 0
}
