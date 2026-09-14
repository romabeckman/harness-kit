import type { QaFinalReport, QaPlan, QaRun, QaScenarioResult, QaScenarioStatus } from '../../../qa/types'
import type { QaReportOutput } from './types'

export function renderQaReportOutput(
  format: Exclude<QaReportOutput, 'send-to-developer'>,
  plan: QaPlan,
  run: QaRun,
  report: QaFinalReport,
): string {
  if (format === 'json') return JSON.stringify(report, null, 2)
  if (format === 'html') return renderHtml(plan, run, report)
  return renderMarkdown(plan, run)
}

function renderHtml(plan: QaPlan, run: QaRun, report: QaFinalReport): string {
  const scenarios = new Map(plan.scenarios.map((scenario) => [scenario.id, scenario]))
  const rows = run.results.map((result) => {
    const scenario = scenarios.get(result.scenarioId)
    return `<tr><td><code>${escapeHtml(result.scenarioId)}</code></td><td>${escapeHtml(scenario?.description ?? result.scenarioId)}</td><td><span class="status ${result.status.toLowerCase()}">${result.status}</span></td><td>${escapeHtml(result.reason ?? '—')}</td><td>${result.evidence.length}</td></tr>`
  }).join('\n')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Harness Kit QA Report</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #18212f; background: #f4f7fb; }
    body { margin: 0; padding: 32px; } main { max-width: 1120px; margin: auto; }
    header { color: white; background: linear-gradient(135deg, #172554, #2563eb); border-radius: 16px; padding: 28px; box-shadow: 0 12px 32px #17255424; }
    h1 { margin: 0 0 8px; } .meta { opacity: .86; } .summary { margin: 24px 0; padding: 20px; background: white; border-radius: 12px; border: 1px solid #dbe4f0; }
    .table-wrap { overflow-x: auto; background: white; border-radius: 12px; border: 1px solid #dbe4f0; }
    table { width: 100%; border-collapse: collapse; } th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #e7edf5; vertical-align: top; }
    th { background: #eef4ff; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; } tr:last-child td { border-bottom: 0; }
    .status { display: inline-block; border-radius: 999px; padding: 4px 9px; font-size: 12px; font-weight: 700; }
    .passed { color: #166534; background: #dcfce7; } .failed { color: #991b1b; background: #fee2e2; } .blocked { color: #92400e; background: #fef3c7; } .inconclusive { color: #4338ca; background: #e0e7ff; }
  </style>
</head>
<body><main>
  <header><h1>Harness Kit QA Report</h1><div class="meta">Run ${escapeHtml(run.id)} · Verdict ${escapeHtml(report.verdict)}</div></header>
  <section class="summary"><strong>Summary</strong><p>${escapeHtml(report.summary)}</p></section>
  <div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Description</th><th>Status</th><th>Result</th><th>Evidence</th></tr></thead><tbody>
${rows}
  </tbody></table></div>
</main></body></html>
`
}

function renderMarkdown(plan: QaPlan, run: QaRun): string {
  const scenarios = new Map(plan.scenarios.map((scenario) => [scenario.id, scenario]))
  const grouped = new Map<QaScenarioStatus, QaScenarioResult[]>()
  for (const result of run.results) {
    grouped.set(result.status, [...(grouped.get(result.status) ?? []), result])
  }
  const lines = ['# QA Report', '', `- **Run:** \`${run.id}\``, `- **Verdict:** ${run.verdict}`]
  for (const status of ['PASSED', 'FAILED', 'BLOCKED', 'INCONCLUSIVE'] as const) {
    const results = grouped.get(status)
    if (!results?.length) continue
    lines.push('', `## ${status}`, '')
    for (const result of results) {
      lines.push(`### ${result.scenarioId} — ${scenarios.get(result.scenarioId)?.description ?? result.scenarioId}`)
      lines.push('', `- **Observed:** ${result.reason ?? status}`)
      lines.push(`- **Evidence:** ${result.evidence.length ? result.evidence.map((item) => `\`${item.path}\``).join(', ') : 'None'}`, '')
    }
  }
  if (grouped.size === 0) lines.push('', 'No scenarios recorded.')
  return `${lines.join('\n').trimEnd()}\n`
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
