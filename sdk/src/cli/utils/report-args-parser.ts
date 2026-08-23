export type ReportExportFormat = 'json' | 'csv'

export interface ReportArgsOptions {
  export?: ReportExportFormat
  output?: string
  help: boolean
  restArgs: string[]
}

const VALID_EXPORT_FORMATS = new Set<string>(['json', 'csv'])

/**
 * Generates the default export filename: `report-harness-kit-YYYY-MM-DDTHH-mm-ss.<format>`
 */
export function generateReportFilename(format: ReportExportFormat, date: Date = new Date()): string {
  const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `report-harness-kit-${timestamp}.${format}`
}

/**
 * Parses arguments for `hrns report`.
 * Supports `--export json|csv`, `--export=<format>`, `--output <file>`, `-o <file>`, `--help`, `-h`.
 */
export function parseReportArgs(args: string[]): ReportArgsOptions {
  const result: ReportArgsOptions = {
    help: false,
    restArgs: [],
  }

  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i]
    let arg: string
    let value: string | undefined

    const equalsIndex = currentArg.indexOf('=')
    if (currentArg.startsWith('--') && equalsIndex !== -1) {
      arg = currentArg.substring(0, equalsIndex)
      value = currentArg.substring(equalsIndex + 1)
    } else {
      arg = currentArg
    }

    if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--export') {
      const format = value !== undefined ? value : args[++i]
      if (!format) {
        throw new Error('Missing export format after --export. Supported formats: json, csv')
      }
      const normalizedFormat = format.toLowerCase().trim()
      if (!VALID_EXPORT_FORMATS.has(normalizedFormat)) {
        throw new Error(`Invalid export format "${format}". Supported formats: json, csv`)
      }
      result.export = normalizedFormat as ReportExportFormat
    } else if (arg === '--output' || arg === '-o') {
      result.output = value !== undefined ? value : args[++i]
    } else {
      result.restArgs.push(currentArg)
    }
  }

  return result
}
