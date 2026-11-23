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

      const candidatePath = c.path || `docs/harness-history/candidates/${c.candidateId}`

      const flags: string[] = []
      if (data.agent && data.agent.trim().length > 0) flags.push(`--agent ${data.agent.trim()}`)
      if (data.model && data.model.trim().length > 0) flags.push(`--model ${data.model.trim()}`)
      if (data.effort && data.effort.trim().length > 0) flags.push(`--effort ${data.effort.trim()}`)
      const flagSuffix = flags.length > 0 ? ` ${flags.join(' ')}` : ''

      lines.push(`\n── Candidate Review ${c.candidateId} ${'─'.repeat(Math.max(0, 30 - c.candidateId.length))}`)
      lines.push(`  1. Review Changes:`)
      lines.push(`     • Inspect diff:      ${AnsiHelpers.dim(candidatePath + '/diff.md')}`)
      lines.push(`     • Read rationale:    ${AnsiHelpers.dim(candidatePath + '/rationale.md')}`)
      lines.push(`  2. Evaluate against the baseline on paired search and reserved tasks.`)
      lines.push(`  3. Review after evaluation or use --auto to approve an evaluated candidate:`)
      lines.push(`     • Interactive:       ${AnsiHelpers.cyan('hrns candidate review ' + c.candidateId + flagSuffix)}`)
      lines.push(`     • Explicit approval: ${AnsiHelpers.cyan('hrns candidate review ' + c.candidateId + ' --auto')}`)
      lines.push(`  4. Verify in Next Run:`)
      lines.push(`     • Run 'hrns run' to execute orchestration with the upgraded skill.`)
    } else if (data.optimization) {
      const status = { blocked: 'Blocked', no_candidate: 'No candidate', failed: 'Failed' }[data.optimization.status]
      lines.push(`  Optimization Status: ${status}`)
      lines.push(`  Reason: ${data.optimization.reason}`)
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
