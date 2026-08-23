import { describe, it, expect } from 'vitest'
import { parseReportArgs, generateReportFilename } from '../report-args-parser'

describe('parseReportArgs', () => {
  it('returns default empty options when no args provided', () => {
    const result = parseReportArgs([])
    expect(result).toEqual({
      export: undefined,
      output: undefined,
      help: false,
      restArgs: [],
    })
  })

  it('parses --export json and --export csv', () => {
    expect(parseReportArgs(['--export', 'json'])).toEqual({
      export: 'json',
      output: undefined,
      help: false,
      restArgs: [],
    })

    expect(parseReportArgs(['--export', 'csv'])).toEqual({
      export: 'csv',
      output: undefined,
      help: false,
      restArgs: [],
    })
  })

  it('parses --export=json and --export=csv format', () => {
    expect(parseReportArgs(['--export=json'])).toEqual({
      export: 'json',
      output: undefined,
      help: false,
      restArgs: [],
    })

    expect(parseReportArgs(['--export=csv'])).toEqual({
      export: 'csv',
      output: undefined,
      help: false,
      restArgs: [],
    })
  })

  it('parses --output and -o flags', () => {
    expect(parseReportArgs(['--export', 'json', '--output', 'my-report.json'])).toEqual({
      export: 'json',
      output: 'my-report.json',
      help: false,
      restArgs: [],
    })

    expect(parseReportArgs(['--export=csv', '-o', 'custom.csv'])).toEqual({
      export: 'csv',
      output: 'custom.csv',
      help: false,
      restArgs: [],
    })
  })

  it('throws an error when invalid export format is provided', () => {
    expect(() => parseReportArgs(['--export', 'yaml'])).toThrow(
      'Invalid export format "yaml". Supported formats: json, csv'
    )
  })

  it('throws an error when --export flag is missing format argument', () => {
    expect(() => parseReportArgs(['--export'])).toThrow(
      'Missing export format after --export. Supported formats: json, csv'
    )
  })

  it('parses --help and -h', () => {
    expect(parseReportArgs(['--help'])).toEqual({
      export: undefined,
      output: undefined,
      help: true,
      restArgs: [],
    })
    expect(parseReportArgs(['-h'])).toEqual({
      export: undefined,
      output: undefined,
      help: true,
      restArgs: [],
    })
  })

  it('preserves unrecognized rest arguments', () => {
    const result = parseReportArgs(['--export', 'json', '--custom', 'foo'])
    expect(result.export).toBe('json')
    expect(result.restArgs).toEqual(['--custom', 'foo'])
  })
})

describe('generateReportFilename', () => {
  it('generates filename in format report-harness-kit-TIMESTAMP.json', () => {
    const fixedDate = new Date('2026-08-23T10:48:12.000Z')
    const filename = generateReportFilename('json', fixedDate)
    expect(filename).toBe('report-harness-kit-2026-08-23T10-48-12.json')
  })

  it('generates filename in format report-harness-kit-TIMESTAMP.csv', () => {
    const fixedDate = new Date('2026-08-23T10:48:12.000Z')
    const filename = generateReportFilename('csv', fixedDate)
    expect(filename).toBe('report-harness-kit-2026-08-23T10-48-12.csv')
  })
})
