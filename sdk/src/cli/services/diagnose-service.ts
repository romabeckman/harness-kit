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
import { AgentRunnerFactory } from '../../agent-runner/AgentRunnerFactory'
import { Runner } from '../../agent-runner/types'
import { HarnessSettings } from '../../settings/HarnessSettings'
import { AnsiHelpers } from '../../ui/AnsiHelpers'
import { DebugContext } from '../DebugContext'

import { parseStandardRunnerArgs } from '../utils/runner-args-parser'

export interface DiagnoseCliOptions {
  agentType?: string
  model?: string
  effort?: string
  batchSize?: number
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
  }

  return result
}

export async function cmdDiagnose(cwd: string, args: string[]): Promise<void> {
  const options = parseDiagnoseArgs(args)
  const ledgerPath = DiagnosePaths.ledgerPath(cwd)

  const ledger = new JsonlSessionLedger(ledgerPath)
  const pending = ledger.loadPending()

  console.log(`\n── Harness Diagnose ────────────────────────────────────`)
  console.log(`  ledger:   docs/product/diagnose-sessions.jsonl`)
  console.log(`  pending:  ${pending.length} session(s)`)
  console.log(`────────────────────────────────────────────────────────\n`)

  if (pending.length === 0) {
    console.log(`${AnsiHelpers.green('✓')} No pending diagnose sessions found in docs/product/diagnose-sessions.jsonl`)
    return
  }

  const agentRunner = AgentRunnerFactory.create({
    type: options.agentType ?? Runner.CLAUDE_CLI,
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
  })

  const batchSize = options.batchSize ?? 3
  console.log(`${AnsiHelpers.blue('►')} Processing sessions in batches of ${batchSize}...\n`)

  let batchIndex = 1
  const result = await service.processAllPendingInBatches(batchSize, (batch) => {
    console.log(
      `${AnsiHelpers.green('✓')} Diagnose batch completed: ${batch.processed} processed, ${batch.remaining} remaining.`
    )
    batchIndex++
    return true
  })

  if (result.report) {
    DiagnoseReportRenderer.render(result.report)
  } else {
    console.log(`\n${AnsiHelpers.green('✔')} All diagnose batches completed (${result.processed} total sessions processed).\n`)
  }
}
