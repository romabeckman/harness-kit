export type ReportExportFormat = 'json' | 'csv'

export interface ReportArgsOptions {
  export?: ReportExportFormat
  help: boolean
  restArgs: string[]
}

const VALID_EXPORT_FORMATS = new Set<string>(['json', 'csv'])

/**
 * Parses arguments for `hrns report`.
 * Supports `--export json|csv`, `--export=<format>`, `--help`, `-h`.
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
    } else {
      result.restArgs.push(currentArg)
    }
  }

  return result
}
