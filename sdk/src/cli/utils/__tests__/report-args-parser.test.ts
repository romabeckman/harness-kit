import { describe, it, expect } from 'vitest'
import { parseReportArgs } from '../report-args-parser'

describe('parseReportArgs', () => {
  it('returns default empty options when no args provided', () => {
    const result = parseReportArgs([])
    expect(result).toEqual({
      export: undefined,
      help: false,
      restArgs: [],
    })
  })

  it('parses --export json and --export csv', () => {
    expect(parseReportArgs(['--export', 'json'])).toEqual({
      export: 'json',
      help: false,
      restArgs: [],
    })

    expect(parseReportArgs(['--export', 'csv'])).toEqual({
      export: 'csv',
      help: false,
      restArgs: [],
    })
  })

  it('parses --export=json and --export=csv format', () => {
    expect(parseReportArgs(['--export=json'])).toEqual({
      export: 'json',
      help: false,
      restArgs: [],
    })

    expect(parseReportArgs(['--export=csv'])).toEqual({
      export: 'csv',
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
      help: true,
      restArgs: [],
    })
    expect(parseReportArgs(['-h'])).toEqual({
      export: undefined,
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
