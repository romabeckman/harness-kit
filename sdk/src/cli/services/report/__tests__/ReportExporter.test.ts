import { describe, it, expect } from 'vitest'
import { ReportExporter } from '../ReportExporter'
import type { ProductReport } from '../types'
import type { TokenEntry } from '../../../../telemetry/TokenLedger'

function makeMockReport(entries: TokenEntry[] = []): ProductReport {
  return {
    backlogSummary: {
      total: 2,
      byStatus: {
        NOT_STARTED: 1,
        IN_PROGRESS: 1,
        BLOCKED: 0,
        COMPLETED: 0,
        FAILED: 0,
      },
      avgScoreTL: 0.85,
      avgScoreAdv: 0.9,
    },
    taskSummary: {
      total: 3,
      byStatus: {
        NOT_STARTED: 1,
        IN_PROGRESS: 1,
        COMPLETED: 1,
        BLOCKED: 0,
        FAILED: 0,
      },
      byFeature: {
        F001: {
          featureId: 'F001',
          title: 'Feature One',
          status: 'IN_PROGRESS',
          totalTasks: 3,
          completedTasks: 1,
          reworks: 0,
        },
      },
    },
    configSnapshot: {
      projectPaths: ['src/core'],
      currentPhase: 'DEVELOPMENT',
      scoreThresholdTL: 0.7,
      scoreThresholdAdv: 0.7,
      maxReworks: 2,
      completedCycles: 1,
    },
    decisionSummary: {
      totalDecisions: 1,
      recentDecisions: ['Approved scope'],
    },
    tokenReport: {
      entries,
      events: [],
      totals: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 100,
        cacheReadTokens: 200,
        costUsd: 0.05,
      },
      bySkill: {
        'tdd-orchestrator': {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationTokens: 100,
          cacheReadTokens: 200,
          costUsd: 0.05,
        },
      },
    },
  }
}

describe('ReportExporter', () => {
  const sampleEntries: TokenEntry[] = [
    {
      ts: '2026-08-23T12:00:00.000Z',
      agent: 'developer-backend',
      skill: 'tdd-orchestrator',
      model: 'gpt-5.6',
      effort: 'high',
      featureId: 'F001',
      phase: 'DEVELOPMENT',
      runner: 'copilot-cli',
      inputTokens: 12400,
      outputTokens: 2100,
      cacheCreationTokens: 500,
      cacheReadTokens: 8000,
      costUsd: 0.0421,
      durationMs: 4500,
      status: 'success',
    },
    {
      ts: '2026-08-23T12:05:00.000Z',
      agent: 'harness-qa',
      skill: 'adversarial-qa',
      model: 'gpt-5.6',
      effort: 'medium',
      featureId: 'F001',
      phase: 'REVIEW',
      runner: 'copilot-cli',
      inputTokens: 5000,
      outputTokens: 1200,
      cacheCreationTokens: 0,
      cacheReadTokens: 3000,
      costUsd: 0.015,
      durationMs: 2300,
      status: 'success',
    },
  ]

  it('exports report data as JSON with canonical schema', () => {
    const exporter = new ReportExporter()
    const report = makeMockReport(sampleEntries)
    const jsonOutput = exporter.export(report, 'json')

    const parsed = JSON.parse(jsonOutput)
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.generatedAt).toBeDefined()
    expect(parsed.records).toHaveLength(2)
    expect(parsed.records[0]).toEqual({
      timestamp: '2026-08-23T12:00:00.000Z',
      featureId: 'F001',
      phase: 'DEVELOPMENT',
      runner: 'copilot-cli',
      agent: 'developer-backend',
      skill: 'tdd-orchestrator',
      model: 'gpt-5.6',
      effort: 'high',
      inputTokens: 12400,
      outputTokens: 2100,
      cacheCreationTokens: 500,
      cacheReadTokens: 8000,
      costUsd: 0.0421,
      durationMs: 4500,
      status: 'success',
    })
  })

  it('exports report data as CSV with proper headers and escaping', () => {
    const exporter = new ReportExporter()
    const entriesWithSpecialChars: TokenEntry[] = [
      {
        ts: '2026-08-23T12:00:00.000Z',
        agent: 'developer, "lead"',
        skill: 'tdd\nline',
        model: 'gpt-5.6',
        effort: 'high',
        featureId: 'F001',
        phase: 'DEVELOPMENT',
        runner: 'copilot-cli',
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0.001,
        durationMs: 100,
        status: 'success',
      },
    ]
    const report = makeMockReport(entriesWithSpecialChars)
    const csvOutput = exporter.export(report, 'csv')

    const lines = csvOutput.trim().split('\n')
    expect(lines[0]).toBe('timestamp,featureId,phase,runner,agent,skill,model,effort,inputTokens,outputTokens,cacheCreationTokens,cacheReadTokens,costUsd,durationMs,status')
    expect(csvOutput).toContain('"developer, ""lead"""')
    expect(csvOutput).toContain('"tdd\nline"')
  })

  it('handles empty entries gracefully in both JSON and CSV', () => {
    const exporter = new ReportExporter()
    const report = makeMockReport([])

    const jsonOutput = exporter.export(report, 'json')
    const parsed = JSON.parse(jsonOutput)
    expect(parsed.records).toEqual([])

    const csvOutput = exporter.export(report, 'csv')
    const lines = csvOutput.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('timestamp,featureId,phase,runner,agent,skill,model,effort,inputTokens,outputTokens,cacheCreationTokens,cacheReadTokens,costUsd,durationMs,status')
  })
})
