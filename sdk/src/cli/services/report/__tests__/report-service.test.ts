import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cmdReport } from '../../report-service'

describe('cmdReport', () => {
  let tempDir: string
  let stdoutWriteSpy: any

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

    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutWriteSpy.mockRestore()
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('outputs raw JSON when called with --export json', () => {
    cmdReport(tempDir, ['--export', 'json'])

    expect(stdoutWriteSpy).toHaveBeenCalled()
    const written = stdoutWriteSpy.mock.calls.map((c: any) => c[0]).join('')
    const parsed = JSON.parse(written)
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].featureId).toBe('F001')
    expect(parsed.records[0].effort).toBe('high')
  })

  it('outputs raw CSV when called with --export csv', () => {
    cmdReport(tempDir, ['--export', 'csv'])

    expect(stdoutWriteSpy).toHaveBeenCalled()
    const written = stdoutWriteSpy.mock.calls.map((c: any) => c[0]).join('')
    const lines = written.trim().split('\n')
    expect(lines[0]).toBe('timestamp,featureId,phase,runner,agent,skill,model,effort,inputTokens,outputTokens,cacheCreationTokens,cacheReadTokens,costUsd,durationMs,status')
    expect(lines[1]).toContain('F001')
    expect(lines[1]).toContain('high')
  })
})
