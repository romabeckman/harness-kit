import { describe, it, expect, vi } from 'vitest'
import { DiagnoseReportRenderer } from '../DiagnoseReportRenderer'
import type { DiagnoseReportData } from '../types'

describe('DiagnoseReportRenderer', () => {
  it('renders report with candidate created', () => {
    const data: DiagnoseReportData = {
      processedSessions: 2,
      remainingSessions: 0,
      sessionIds: ['session-2026-08-15-001', 'session-2026-08-15-002'],
      traceIds: ['session-2026-08-15-001', 'session-2026-08-15-002'],
      candidateCreated: {
        candidateId: 'v001',
        targetSkill: 'autonomous-orchestrator',
        status: 'PROPOSED',
        action: 'EVALUATE_CANDIDATE',
        path: 'docs/harness-history/candidates/v001',
        rationale: 'Worst sessions diverged at phase C',
        proposedChange: 'Add circuit breaker to phase C',
      },
    }

    const logs: string[] = []
    const printFn = (msg: string) => logs.push(msg)

    DiagnoseReportRenderer.render(data, printFn)
    const combined = logs.join('\n')

    expect(combined).toContain('Harness Diagnose Report')
    expect(combined).toContain('Sessions Processed:')
    expect(combined).toContain('2')
    expect(combined).toContain('session-2026-08-15-001')
    expect(combined).toContain('Meta-Harness Optimization')
    expect(combined).toContain('v001')
    expect(combined).toContain('autonomous-orchestrator')
    expect(combined).toContain('PROPOSED')
    expect(combined).toContain('EVALUATE_CANDIDATE')
    expect(combined).toContain('Worst sessions diverged at phase C')
    expect(combined).toContain('How to Apply Candidate v001')
    expect(combined).toContain('Review Changes')
    expect(combined).toContain('docs/harness-history/candidates/v001/diff.md')
    expect(combined).toContain('skills/autonomous-orchestrator/SKILL.md')
    expect(combined).toContain('promoted: true')
  })

  it('renders report when no candidate was created', () => {
    const data: DiagnoseReportData = {
      processedSessions: 1,
      remainingSessions: 0,
      sessionIds: ['session-2026-08-15-001'],
      candidateCreated: null,
    }

    const logs: string[] = []
    const printFn = (msg: string) => logs.push(msg)

    DiagnoseReportRenderer.render(data, printFn)
    const combined = logs.join('\n')

    expect(combined).toContain('Harness Diagnose Report')
    expect(combined).toContain('Sessions Processed:')
    expect(combined).toContain('1')
    expect(combined).toContain('Meta-Harness Optimization')
    expect(combined).toContain('None')
  })

  it('formats report data to string with format()', () => {
    const data: DiagnoseReportData = {
      processedSessions: 3,
      remainingSessions: 0,
      sessionIds: ['s1', 's2', 's3'],
      candidateCreated: {
        candidateId: 'v005',
        targetSkill: 'meta-harness',
      },
    }

    const output = DiagnoseReportRenderer.format(data)
    expect(output).toContain('Harness Diagnose Report')
    expect(output).toContain('v005')
    expect(output).toContain('meta-harness')
  })

  it('appends --agent, --model, and --effort to candidate review suggestion when provided', () => {
    const data: DiagnoseReportData = {
      processedSessions: 1,
      remainingSessions: 0,
      sessionIds: ['s1'],
      candidateCreated: {
        candidateId: 'v002',
        targetSkill: 'tdd-orchestrator',
      },
      agent: 'antigravity-cli',
      model: 'gemini-3.7-flash',
      effort: 'high',
    }

    const output = DiagnoseReportRenderer.format(data)
    expect(output).toContain('hrns candidate review v002 --agent antigravity-cli --model gemini-3.7-flash --effort high')
  })
})
