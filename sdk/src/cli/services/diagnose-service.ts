import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { JsonlSessionLedger } from '../../diagnose/JsonlSessionLedger'
import { TraceDirectoryScanner } from '../../diagnose/TraceDirectoryScanner'
import { SessionIdGenerator } from '../../diagnose/SessionIdGenerator'
import { MetaHarnessAgentAdapter } from '../../diagnose/MetaHarnessAgentAdapter'
import { DiagnoseService } from '../../diagnose/DiagnoseService'
import { AgentRunnerFactory } from '../../agent-runner/AgentRunnerFactory'
import { Runner } from '../../agent-runner/types'
import { HarnessSettings } from '../../settings/HarnessSettings'
import { AnsiHelpers } from '../../ui/AnsiHelpers'
import { DebugContext } from '../DebugContext'

export interface DiagnoseCliOptions {
  agentType?: string
  model?: string
  effort?: string
  batchSize?: number
}

export function parseDiagnoseArgs(args: string[]): DiagnoseCliOptions {
  const result: DiagnoseCliOptions = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--agent' || arg === '-a') {
      result.agentType = args[++i]
    } else if (arg === '--model' || arg === '-m') {
      result.model = args[++i]
    } else if (arg === '--effort' || arg === '-e') {
      result.effort = args[++i]
    } else if (arg === '--batch-size') {
      const parsed = parseInt(args[++i], 10)
      if (!isNaN(parsed) && parsed > 0) {
        result.batchSize = parsed
      }
    } else if (arg === '--debug') {
      DebugContext.enable()
    }
  }

  return result
}

export async function cmdDiagnose(cwd: string, args: string[]): Promise<void> {
  const options = parseDiagnoseArgs(args)
  const productDir = join(cwd, 'docs', 'product')
  const ledgerPath = join(productDir, 'diagnose-sessions.jsonl')

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

  const service = new DiagnoseService({
    ledger,
    agentAdapter,
    idGenerator,
    settings,
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

  console.log(`\n${AnsiHelpers.green('✔')} All diagnose batches completed (${result.processed} total sessions processed).\n`)
}
