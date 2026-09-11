import { describe, expect, it } from 'vitest'
import { QaTerminalView } from '../QaTerminalView'
import type { QaFinalReport } from '../../types'

describe('QaTerminalView', () => {
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
    expect(text).toContain('[1/3] Planning test scenarios')
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
