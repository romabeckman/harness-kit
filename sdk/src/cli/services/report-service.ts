import { join } from 'node:path'

export function cmdReport(cwd: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TokenLedger } = require('../../telemetry/TokenLedger') as typeof import('../../telemetry/TokenLedger')
  const ledger = new TokenLedger(join(cwd, 'docs', 'product', 'tokens.jsonl'))
  ledger.printReport()
}
