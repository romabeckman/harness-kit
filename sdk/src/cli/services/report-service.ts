import { join } from 'node:path'
import { FileStateManager } from '../../file-state/FileStateManager'
import { ReportDataAggregator } from './report/ReportDataAggregator'
import { ReportRenderer } from './report/ReportRenderer'

export function cmdReport(cwd: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TokenLedger } = require('../../telemetry/TokenLedger') as typeof import('../../telemetry/TokenLedger')
  const ledger = new TokenLedger(join(cwd, 'docs', 'product', 'tokens.jsonl'))
  const fsm = new FileStateManager({ productDir: join(cwd, 'docs', 'product') })
  
  const aggregator = new ReportDataAggregator(fsm, ledger)
  const report = aggregator.aggregate()
  
  const renderer = new ReportRenderer()
  renderer.render(report)
  
  // Ledger still handles its own detailed printing if we want to delegate, but our renderer 
  // also prints a summary. For full compatibility, we can also print the ledger's detailed report.
  ledger.printReport()
}
