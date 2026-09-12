import { describe, expect, it } from 'vitest'
import { QaTerminalView } from '../QaTerminalView'
import type { QaFinalReport } from '../../types'

describe('QaTerminalView', () => {
  it('highlights completed, active, and pending phases during transitions', () => {
    const output: string[] = []
    const view = new QaTerminalView((line) => output.push(line), false)

    view.start({ scope: 'Test transitions' }, 'C:\\project')
    view.onProgress({ type: 'phase_started', phase: 'PLANNING' })
    view.onProgress({ type: 'phase_completed', phase: 'PLANNING', totalScenarios: 2 })
    view.onProgress({ type: 'phase_started', phase: 'VALIDATION' })
    view.onProgress({ type: 'phase_completed', phase: 'VALIDATION' })
    view.onProgress({ type: 'phase_started', phase: 'EXECUTION' })

    const pipelineStates = output.filter((line) => line.includes('QA Pipeline State:'))
    expect(pipelineStates).toEqual([
      '── QA Pipeline State: [● PLANNING →   VALIDATION →   EXECUTION →   ANALYSIS →   REPORTING] ──',
      '── QA Pipeline State: [✔ PLANNING → ● VALIDATION →   EXECUTION →   ANALYSIS →   REPORTING] ──',
      '── QA Pipeline State: [✔ PLANNING → ✔ VALIDATION → ● EXECUTION →   ANALYSIS →   REPORTING] ──',
    ])
  })

  it('shows phase and scenario progress followed by the final human-readable report', () => {
    const output: string[] = []
    const view = new QaTerminalView((line) => output.push(line), false)

    view.start({ scope: 'Test endpoint X' }, 'C:\\project')
    view.onProgress({ type: 'phase_started', phase: 'PLANNING' })
    view.onProgress({ type: 'phase_completed', phase: 'PLANNING', totalScenarios: 1 })
    view.onProgress({ type: 'phase_started', phase: 'EXECUTION' })
    view.onProgress({ type: 'scenario_started', scenarioId: 'health', description: 'Call health endpoint', index: 1, total: 1 })
    view.onProgress({ type: 'scenario_completed', scenarioId: 'health', status: 'PASSED', index: 1, total: 1 })
    view.onProgress({ type: 'phase_started', phase: 'REPORTING' })
    view.renderReport(report())

    const text = output.join('\n')
    expect(text).toContain('QA TEST RUN')
    expect(text).toContain('[1/5] Planning test scenarios')
    expect(text).toContain('1 scenario ready')
    expect(text).toContain('[1/1] Call health endpoint')
    expect(text).toContain('PASSED health')
    expect(text).toContain('FINAL REPORT: PASS')
    expect(text).toContain('Success criteria')
    expect(text).toContain('Health endpoint responds')
    expect(text).toContain('Bugs: none')
    expect(text).toContain('Errors: none')
  })

  it('renders bug and execution error details', () => {
    const output: string[] = []
    const view = new QaTerminalView((line) => output.push(line), false)
    const failed = report()
    failed.verdict = 'FAIL'
    failed.bugs = [{ scenarioId: 'health', title: 'Unexpected status', severity: 'HIGH', expected: '200', actual: '500', evidence: ['response.body'] }]
    failed.errors = [{ scenarioId: 'health', message: 'Browser disconnected' }]

    view.renderReport(failed)

    const text = output.join('\n')
    expect(text).toContain('[HIGH] Unexpected status (health)')
    expect(text).toContain('Expected: 200')
    expect(text).toContain('Actual: 500')
    expect(text).toContain('Browser disconnected (health)')
  })

  it('renders coverage matrix with tested and untested categories', () => {
    const output: string[] = []
    const view = new QaTerminalView((line) => output.push(line), false)
    const reportWithCoverage = report()
    reportWithCoverage.coverageMatrix = {
      testedCategories: ['functional', 'security'],
      untestedCategories: ['accessibility', 'resilience'],
      areas: {
        functional: { category: 'functional', total: 2, passed: 2, failed: 0, blocked: 0, untested: 0 },
        security: { category: 'security', total: 1, passed: 1, failed: 0, blocked: 0, untested: 0 },
        boundary: { category: 'boundary', total: 0, passed: 0, failed: 0, blocked: 0, untested: 1 },
        negative: { category: 'negative', total: 0, passed: 0, failed: 0, blocked: 0, untested: 1 },
        accessibility: { category: 'accessibility', total: 0, passed: 0, failed: 0, blocked: 0, untested: 1 },
        resilience: { category: 'resilience', total: 0, passed: 0, failed: 0, blocked: 0, untested: 1 },
      },
    }

    view.renderReport(reportWithCoverage)

    const text = output.join('\n')
    expect(text).toContain('Coverage matrix')
    expect(text).toContain('functional: 2 passed')
    expect(text).toContain('Untested areas: accessibility, resilience')
  })

  it('renders a bordered final summary with verdict and outcome counts', () => {
    const output: string[] = []
    const view = new QaTerminalView((line) => output.push(line), false)
    const reportWithSummary = report()
    reportWithSummary.verdict = 'BLOCKED'
    reportWithSummary.successCriteria = [
      { criterion: 'Passed criterion', status: 'PASSED', evidence: [] },
      { criterion: 'Failed criterion', status: 'FAILED', evidence: [] },
      { criterion: 'Blocked criterion', status: 'BLOCKED', evidence: [] },
      { criterion: 'Inconclusive criterion', status: 'INCONCLUSIVE', evidence: [] },
    ]
    reportWithSummary.bugs = [{ scenarioId: 'blocked', title: 'Target unavailable', severity: 'HIGH', expected: 'Reachable target', actual: 'No response', evidence: [] }]
    reportWithSummary.errors = [{ message: 'Probe failed' }]

    view.renderReport(reportWithSummary)

    const text = output.join('\n')
    expect(text).toContain('╔')
    expect(text).toContain('QA FINAL SUMMARY')
    expect(text).toContain('Verdict: BLOCKED')
    expect(text).toContain('Criteria: 4 total | 1 passed | 1 failed | 1 blocked | 1 inconclusive')
    expect(text).toContain('Bugs: 1')
    expect(text).toContain('Errors: 1')
    expect(text).toContain('FINAL REPORT: BLOCKED')
  })

  it('prints every plan validation error immediately', () => {
    const output: string[] = []
    const view = new QaTerminalView((line) => output.push(line), false)

    view.onProgress({ type: 'validation_failed', errors: ['target must be a valid HTTP or HTTPS URL', 'scenario-1 has no executable request'] })

    const text = output.join('\n')
    expect(text).toContain('QA plan validation failed')
    expect(text).toContain('- target must be a valid HTTP or HTTPS URL')
    expect(text).toContain('- scenario-1 has no executable request')
  })
})

function report(): QaFinalReport {
  return {
    schemaVersion: 1,
    runId: 'run-1',
    planId: 'health-plan',
    verdict: 'PASS',
    summary: 'Health check passed.',
    successCriteria: [{ criterion: 'Health endpoint responds', status: 'PASSED', evidence: ['response.body'] }],
    bugs: [],
    errors: [],
    completedAt: '2026-09-11T00:00:00.000Z',
  }
}
