import { AnsiHelpers } from '../ui/AnsiHelpers'
import type { DiagnoseReportData } from './types'

export class DiagnoseReportRenderer {
  static format(data: DiagnoseReportData): string {
    const lines: string[] = []
    const hr = '─'.repeat(56)

    lines.push(`\n── Harness Diagnose Report ${'─'.repeat(30)}`)
    lines.push(`  Sessions Processed: ${AnsiHelpers.green(String(data.processedSessions))}`)

    if (data.sessionIds && data.sessionIds.length > 0) {
      lines.push(`  Session IDs:        ${AnsiHelpers.dim(data.sessionIds.join(', '))}`)
    }

    if (data.traceIds && data.traceIds.length > 0) {
      lines.push(`  Traces Generated:   ${AnsiHelpers.dim(data.traceIds.join(', '))}`)
    }

    lines.push(`  Remaining Pending:  ${data.remainingSessions}`)

    lines.push(`\n── Meta-Harness Optimization ${'─'.repeat(28)}`)
    if (data.candidateCreated) {
      const c = data.candidateCreated
      const statusText = c.status ? ` (${c.status})` : ''
      lines.push(`  Candidate Created:  ${AnsiHelpers.green(c.candidateId)}${statusText}`)
      lines.push(`  Target Skill:       ${AnsiHelpers.blue(c.targetSkill)}`)

      if (c.path) {
        lines.push(`  Candidate Path:     ${AnsiHelpers.dim(c.path)}`)
      }

      if (c.action) {
        lines.push(`  Decision Action:    ${c.action}`)
      }

      if (c.rationale) {
        const shortRationale = c.rationale.split('\n')[0].trim()
        lines.push(`  Rationale:          ${shortRationale}`)
      }

      if (c.proposedChange) {
        const shortChange = c.proposedChange.split('\n')[0].trim()
        lines.push(`  Proposed Change:    ${shortChange}`)
      }
    } else {
      lines.push(`  Candidate Created:  ${AnsiHelpers.dim('None (No candidate proposed in this run)')}`)
    }

    lines.push(`${hr}\n`)
    return lines.join('\n')
  }

  static render(data: DiagnoseReportData, printFn: (msg: string) => void = console.log): void {
    printFn(DiagnoseReportRenderer.format(data))
  }
}
