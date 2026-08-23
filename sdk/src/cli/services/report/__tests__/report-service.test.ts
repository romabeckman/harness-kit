import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cmdReport } from '../../report-service'

describe('cmdReport', () => {
  let tempDir: string
  let consoleLogSpy: any

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'report-service-test-'))
    const productDir = join(tempDir, 'docs', 'product')
    mkdirSync(productDir, { recursive: true })

    const sampleTokens = [
      JSON.stringify({
        ts: '2026-08-23T12:00:00.000Z',
        agent: 'developer-backend',
        skill: 'tdd-orchestrator',
        model: 'gpt-5.6',
        effort: 'high',
        featureId: 'F001',
        phase: 'DEVELOPMENT',
        runner: 'copilot-cli',
        executionMetrics: { durationMs: 1500, status: 'success' },
        tokenUsage: {
          inputTokens: 1000,
          outputTokens: 200,
          cacheCreationTokens: 50,
          cacheReadTokens: 100,
          calculatedCostUsd: 0.005,
        },
      }),
    ].join('\n')
    writeFileSync(join(productDir, 'tokens.jsonl'), sampleTokens, 'utf8')

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('generates report-harness-kit-TIMESTAMP.json on local root when called with --export json', () => {
    cmdReport(tempDir, ['--export', 'json'])

    const files = readdirSync(tempDir)
    const reportFile = files.find((f) => f.startsWith('report-harness-kit-') && f.endsWith('.json'))
    expect(reportFile).toBeDefined()

    const content = readFileSync(join(tempDir, reportFile!), 'utf8')
    const parsed = JSON.parse(content)
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].featureId).toBe('F001')
    expect(parsed.records[0].effort).toBe('high')

    const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
    expect(logCalls).toContain('Report exported to:')
    expect(logCalls).toContain(reportFile!)
  })

  it('generates report-harness-kit-TIMESTAMP.csv on local root when called with --export csv', () => {
    cmdReport(tempDir, ['--export', 'csv'])

    const files = readdirSync(tempDir)
    const reportFile = files.find((f) => f.startsWith('report-harness-kit-') && f.endsWith('.csv'))
    expect(reportFile).toBeDefined()

    const content = readFileSync(join(tempDir, reportFile!), 'utf8')
    const lines = content.trim().split('\n')
    expect(lines[0]).toBe('timestamp,featureId,phase,runner,agent,skill,model,effort,inputTokens,outputTokens,cacheCreationTokens,cacheReadTokens,costUsd,durationMs,status')
    expect(lines[1]).toContain('F001')
    expect(lines[1]).toContain('high')

    const logCalls = consoleLogSpy.mock.calls.flat().join('\n')
    expect(logCalls).toContain('Report exported to:')
    expect(logCalls).toContain(reportFile!)
  })

  it('supports custom output path with --output', () => {
    cmdReport(tempDir, ['--export', 'json', '--output', 'custom-report.json'])

    const files = readdirSync(tempDir)
    expect(files).toContain('custom-report.json')

    const content = readFileSync(join(tempDir, 'custom-report.json'), 'utf8')
    const parsed = JSON.parse(content)
    expect(parsed.records).toHaveLength(1)
  })
})
