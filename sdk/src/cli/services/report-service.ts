import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { FileStateManager } from '../../file-state/FileStateManager'
import { TokenLedger } from '../../telemetry/TokenLedger'
import { ReportDataAggregator } from './report/ReportDataAggregator'
import { ReportRenderer } from './report/ReportRenderer'
import { ReportExporter } from './report/ReportExporter'
import { parseReportArgs, generateReportFilename } from '../utils/report-args-parser'
import { HELP_REPORT } from '../utils/constants'
import { AnsiHelpers } from '../../ui/AnsiHelpers'

export function cmdReport(cwd: string, args: string[] = []): void {
  const options = parseReportArgs(args)

  if (options.help) {
    console.log(HELP_REPORT)
    return
  }

  const ledger = new TokenLedger(join(cwd, 'docs', 'product', 'tokens.jsonl'))
  const fsm = new FileStateManager({ productDir: join(cwd, 'docs', 'product') })

  const aggregator = new ReportDataAggregator(fsm, ledger)
  const report = aggregator.aggregate()

  if (options.export) {
    const exporter = new ReportExporter()
    const output = exporter.export(report, options.export)
    const filename = options.output ?? generateReportFilename(options.export)
    const targetPath = join(cwd, filename)
    writeFileSync(targetPath, output, 'utf8')
    console.log(`\n  ${AnsiHelpers.green('✔')} Report exported to: ${AnsiHelpers.cyan(filename)}\n`)
    return
  }

  const renderer = new ReportRenderer()
  renderer.render(report)

  // Ledger still handles its own detailed printing if we want to delegate, but our renderer
  // also prints a summary. For full compatibility, we can also print the ledger's detailed report.
  ledger.printReport()
}
