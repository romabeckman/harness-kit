import { AnsiHelpers } from '../../ui/AnsiHelpers'
import type { QaAgenticRequest, QaFinalReport, QaScenarioStatus, QaVerdict } from '../types'
import type { QaProgressEvent, QaTerminalPresenter } from '../progress'

type Writer = (line: string) => void

export class QaTerminalView implements QaTerminalPresenter {
  readonly #write: Writer
  readonly #colors: boolean

  constructor(write: Writer = (line) => process.stdout.write(`${line}\n`), colors = process.stdout.isTTY) {
    this.#write = write
    this.#colors = colors
  }

  start(request: QaAgenticRequest, workspace: string): void {
    this.line('')
    this.line(this.paint('cyan', 'QA TEST RUN'))
    this.line(`Scope: ${request.scope ?? 'Derived from supplied scenarios'}`)
    this.line(`Project: ${workspace}`)
    this.line('')
  }

  onProgress(event: QaProgressEvent): void {
    if (event.type === 'phase_warning') {
      this.line(this.paint('yellow', `  ${event.phase ?? 'QA'} warning: ${event.reason ?? 'Phase could not complete'}`))
      return
    }
    if (event.type === 'runtime_ready' && event.target) {
      this.line(this.paint('green', `Runtime ready: ${event.target}${event.managed ? ' (temporary static server)' : ''}`))
      return
    }
    if (event.type === 'phase_started' && event.phase) {
      this.line(this.phaseLabel(event.phase))
      return
    }
    if (event.type === 'validation_failed') {
      this.line(this.paint('red', 'QA plan validation failed'))
      for (const error of event.errors ?? []) this.line(this.paint('red', `- ${error}`))
      return
    }
    if (event.type === 'phase_completed' && event.phase === 'PLANNING') {
      const count = event.totalScenarios ?? 0
      this.line(this.paint('green', `  ${count} ${count === 1 ? 'scenario' : 'scenarios'} ready`))
      return
    }
    if (event.type === 'scenario_started') {
      this.line(`  [${event.index}/${event.total}] ${event.description ?? event.scenarioId}`)
      return
    }
    if (event.type === 'scenario_completed' && event.status && event.scenarioId) {
      this.line(`    ${this.status(event.status)} ${event.scenarioId}`)
      if (event.reason) this.line(`      ${event.reason}`)
      return
    }
    if (event.type === 'phase_completed' && event.phase === 'EXECUTION' && event.verdict) {
      this.line(`  Runtime verdict: ${this.verdict(event.verdict)}`)
      return
    }
    if (event.type === 'phase_completed' && event.phase === 'REPORTING') {
      this.line(this.paint('green', '  Report ready'))
    }
  }

  renderReport(report: QaFinalReport): void {
    this.line('')
    this.renderSummaryFrame(report)
    this.line('')
    this.line(`${this.paint('cyan', 'FINAL REPORT')}: ${this.verdict(report.verdict)}`)
    this.line(report.summary)
    this.line('')
    this.line('Success criteria')
    for (const criterion of report.successCriteria) {
      this.line(`  ${this.status(criterion.status)} ${criterion.criterion}${criterion.reason ? ` — ${criterion.reason}` : ''}`)
    }
    this.line('')
    if (report.bugs.length === 0) {
      this.line('Bugs: none')
    } else {
      this.line(`Bugs (${report.bugs.length})`)
      for (const bug of report.bugs) {
        this.line(`  [${bug.severity}] ${bug.title} (${bug.scenarioId})`)
        this.line(`    Expected: ${bug.expected}`)
        this.line(`    Actual: ${bug.actual}`)
        if (bug.evidence.length > 0) this.line(`    Evidence: ${bug.evidence.join(', ')}`)
      }
    }
    this.line('')
    if (report.errors.length === 0) {
      this.line('Errors: none')
    } else {
      this.line(`Errors (${report.errors.length})`)
      for (const error of report.errors) this.line(`  ${error.message}${error.scenarioId ? ` (${error.scenarioId})` : ''}`)
    }
    if (report.coverageMatrix) {
      this.line('')
      this.line('Coverage matrix')
      for (const [category, area] of Object.entries(report.coverageMatrix.areas)) {
        if (area.total > 0) {
          const parts: string[] = []
          if (area.passed > 0) parts.push(`${area.passed} passed`)
          if (area.failed > 0) parts.push(`${area.failed} failed`)
          if (area.blocked > 0) parts.push(`${area.blocked} blocked`)
          this.line(`  ${category}: ${parts.join(', ')}`)
        }
      }
      if (report.coverageMatrix.untestedCategories.length > 0) {
        this.line(`  Untested areas: ${report.coverageMatrix.untestedCategories.join(', ')}`)
      }
    }
    this.line('')
    this.line(this.paint('dim', `Run: ${report.runId}`))
  }

  private renderSummaryFrame(report: QaFinalReport): void {
    const counts: Record<QaScenarioStatus, number> = {
      PASSED: 0,
      FAILED: 0,
      BLOCKED: 0,
      INCONCLUSIVE: 0,
    }
    for (const criterion of report.successCriteria) counts[criterion.status] += 1

    const title = 'QA FINAL SUMMARY'
    const rows = [
      `Verdict: ${this.verdict(report.verdict)}`,
      [
        `Criteria: ${report.successCriteria.length} total`,
        `${counts.PASSED} passed`,
        `${counts.FAILED} failed`,
        `${counts.BLOCKED} blocked`,
        `${counts.INCONCLUSIVE} inconclusive`,
      ].join(' | '),
      `Bugs: ${report.bugs.length}`,
      `Errors: ${report.errors.length}`,
    ]
    const contentWidth = Math.max(
      this.visibleLength(title),
      ...rows.map((row) => this.visibleLength(row)),
    )
    const border = '═'.repeat(contentWidth + 4)
    const frameLine = (left: string, right: string): string => this.paint('cyan', `${left}${border}${right}`)
    const contentLine = (content: string): string => {
      const padding = ' '.repeat(contentWidth - this.visibleLength(content))
      return `║  ${content}${padding}  ║`
    }

    this.line(frameLine('╔', '╗'))
    this.line(contentLine(this.paint('cyan', title)))
    this.line(frameLine('╠', '╣'))
    for (const row of rows) this.line(contentLine(row))
    this.line(frameLine('╚', '╝'))
  }

  private phaseLabel(phase: NonNullable<QaProgressEvent['phase']>): string {
    const labels = {
      PLANNING: '[1/5] Planning test scenarios',
      VALIDATION: '[2/5] Validating QA plan',
      EXECUTION: '[3/5] Executing as a human tester',
      ANALYSIS: '[4/5] Evaluating adaptive coverage',
      REPORTING: '[5/5] Analyzing evidence and bugs',
    }
    return this.paint('blue', labels[phase])
  }

  private status(status: QaScenarioStatus): string {
    const color = status === 'PASSED' ? 'green' : status === 'FAILED' ? 'red' : 'yellow'
    return this.paint(color, status)
  }

  private verdict(verdict: QaVerdict): string {
    const color = verdict === 'PASS' ? 'green' : verdict === 'FAIL' ? 'red' : 'yellow'
    return this.paint(color, verdict)
  }

  private paint(color: 'blue' | 'cyan' | 'dim' | 'green' | 'red' | 'yellow', text: string): string {
    return this.#colors ? AnsiHelpers[color](text) : text
  }

  private visibleLength(text: string): number {
    return text.replace(/\x1b\[[0-9;]*m/g, '').length
  }

  private line(text: string): void {
    this.#write(text)
  }
}
