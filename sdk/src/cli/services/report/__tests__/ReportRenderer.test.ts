import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReportRenderer } from '../ReportRenderer'
import type { ProductReport } from '../types'

describe('ReportRenderer - Unit Tests', () => {
  let stdoutSpy: any

  beforeEach(() => {
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const dummyReport = (): ProductReport => ({
    backlogSummary: {
      total: 3,
      byStatus: { NOT_STARTED: 1, IN_PROGRESS: 1, COMPLETED: 1, BLOCKED: 0, FAILED: 0 },
      avgScoreTL: 0.8,
      avgScoreAdv: 0.9
    },
    taskSummary: {
      total: 5,
      byStatus: { NOT_STARTED: 2, IN_PROGRESS: 1, COMPLETED: 2, BLOCKED: 0, FAILED: 0 },
      byFeature: {
        'F1': { featureId: 'F1', title: 'Feature 1', status: 'COMPLETED', totalTasks: 2, completedTasks: 2, reworks: 0 },
        'F2': { featureId: 'F2', title: 'Feature 2', status: 'IN_PROGRESS', totalTasks: 3, completedTasks: 0, reworks: 1 }
      }
    },
    configSnapshot: {
      projectPaths: ['/api'],
      currentPhase: 'DEVELOPMENT',
      scoreThresholdTL: 0.8,
      scoreThresholdAdv: 0.8,
      maxReworks: 3,
      completedCycles: 2
    },
    decisionSummary: {
      totalDecisions: 2,
      recentDecisions: ['dec1', 'dec2']
    },
    tokenReport: {
      entries: [],
      events: [],
      totals: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0 },
      bySkill: {}
    }
  })

  it('Should output all report sections when ProductReport has data', () => {
    const report = dummyReport()
    const renderer = new ReportRenderer()
    renderer.render(report)

    const calls = stdoutSpy.mock.calls.flat().join('\n')
    expect(calls).toContain('BACKLOG SUMMARY')
    expect(calls).toContain('TASK PROGRESS')
    expect(calls).toContain('CONFIGURATION')
    expect(calls).toContain('RECENT DECISIONS')
    expect(calls).toContain('TOKEN REPORT')
  })

  it('Should display feature progress with completion percentage', () => {
    const report = dummyReport()
    const renderer = new ReportRenderer()
    renderer.render(report)

    const calls = stdoutSpy.mock.calls.flat().join('\n')
    // F1 has 2/2 = 100%, F2 has 0/3 = 0%
    expect(calls).toContain('100%')
    expect(calls).toContain('0%')
    expect(calls).toContain('2/2')
    expect(calls).toContain('0/3')
  })

  it('Should skip decision section when no decisions exist', () => {
    const report = dummyReport()
    report.decisionSummary.totalDecisions = 0
    report.decisionSummary.recentDecisions = []
    
    const renderer = new ReportRenderer()
    renderer.render(report)

    const calls = stdoutSpy.mock.calls.flat().join('\n')
    expect(calls).not.toContain('RECENT DECISIONS')
  })

  it('Should show empty state message when no product files exist', () => {
    const report = dummyReport()
    report.backlogSummary.total = 0
    report.taskSummary.total = 0
    report.configSnapshot.projectPaths = []
    
    const renderer = new ReportRenderer()
    renderer.render(report)

    const calls = stdoutSpy.mock.calls.flat().join('\n')
    expect(calls).toContain('No orchestration session data found')
    // Should still print token report if there are tokens
    expect(calls).toContain('TOKEN REPORT')
  })
})
