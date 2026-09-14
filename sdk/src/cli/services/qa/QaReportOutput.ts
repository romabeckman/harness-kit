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
    const scenarioTitle = scenario?.description ?? result.scenarioId
    return `<tr><td><code>${escapeHtml(result.scenarioId)}</code></td><td>${escapeHtml(scenarioTitle)}</td><td><span class="status ${result.status.toLowerCase()}">${result.status}</span></td><td>${escapeHtml(result.reason ?? '—')}</td><td>${renderEvidenceLinks(result, scenarioTitle)}</td></tr>`
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
    .evidence-link { display: inline-block; color: #1d4ed8; font-weight: 600; }
    dialog { width: min(900px, calc(100vw - 32px)); max-height: min(88vh, 860px); padding: 0; border: 0; border-radius: 16px; box-shadow: 0 24px 80px #0f172a66; color: #18212f; }
    dialog::backdrop { background: #0f172a99; backdrop-filter: blur(3px); }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #e7edf5; }
    .modal-header h2 { margin: 0; font-size: 18px; } .modal-close { border: 0; background: transparent; font-size: 26px; cursor: pointer; color: #64748b; }
    .evidence-preview { max-height: min(70vh, 680px); overflow: auto; padding: 22px; background: #f8fafc; }
    .evidence-item { margin: 0 0 18px; padding: 16px; background: white; border: 1px solid #dbe4f0; border-radius: 10px; }
    .evidence-item:last-child { margin-bottom: 0; }
    .evidence-item-title { margin: 0 0 8px; font-size: 15px; }
    .evidence-item-path { margin: 0 0 12px; color: #64748b; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .evidence-preview-image { display: block; max-width: 100%; max-height: min(48vh, 480px); margin: 0 auto 12px; object-fit: contain; }
    .evidence-preview-frame { display: block; width: 100%; height: min(48vh, 480px); margin: 0 0 12px; border: 1px solid #dbe4f0; background: #f8fafc; }
    .evidence-direct-link { color: #1d4ed8; font-weight: 600; }
    .modal-footer { display: flex; justify-content: flex-end; padding: 14px 22px; border-top: 1px solid #e7edf5; }
  </style>
</head>
<body><main>
  <header><h1>Harness Kit QA Report</h1><div class="meta">Run ${escapeHtml(run.id)} · Verdict ${escapeHtml(report.verdict)}</div></header>
  <section class="summary"><strong>Summary</strong><p>${escapeHtml(report.summary)}</p></section>
  <div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Description</th><th>Status</th><th>Result</th><th>Evidence</th></tr></thead><tbody>
${rows}
  </tbody></table></div>
  <dialog id="evidence-modal" aria-labelledby="evidence-title">
    <div class="modal-header"><h2 id="evidence-title">Evidence</h2><button class="modal-close" id="evidence-close" type="button" aria-label="Close evidence preview">×</button></div>
    <div class="evidence-preview" id="evidence-items" aria-live="polite"></div>
    <div class="modal-footer"><span>Open each file or image from its direct link.</span></div>
  </dialog>
</main>
<script>
(() => {
  const modal = document.getElementById('evidence-modal');
  const title = document.getElementById('evidence-title');
  const items = document.getElementById('evidence-items');
  const close = document.getElementById('evidence-close');
  if (!modal || !title || !items || !close) return;
  document.querySelectorAll('[data-evidence]').forEach((item) => item.addEventListener('click', (event) => {
    event.preventDefault();
    let evidence = [];
    try { evidence = JSON.parse(item.getAttribute('data-evidence') || '[]'); } catch { evidence = []; }
    title.textContent = item.getAttribute('data-evidence-title') || 'Evidence';
    items.replaceChildren();
    evidence.forEach((entry, index) => {
      const card = document.createElement('article');
      card.className = 'evidence-item';
      const heading = document.createElement('h3');
      heading.className = 'evidence-item-title';
      heading.textContent = entry.title || ('Evidence ' + (index + 1));
      card.append(heading);
      const path = document.createElement('p');
      path.className = 'evidence-item-path';
      path.textContent = entry.path || entry.url || '';
      card.append(path);
      if (entry.kind === 'image') {
        const image = document.createElement('img');
        image.className = 'evidence-preview-image';
        image.alt = entry.title || 'Evidence image';
        image.src = entry.url || '#';
        card.append(image);
      } else {
        const frame = document.createElement('iframe');
        frame.className = 'evidence-preview-frame';
        frame.title = entry.title || 'Evidence document or folder';
        frame.setAttribute('sandbox', '');
        frame.src = entry.url || '#';
        card.append(frame);
      }
      const directLink = document.createElement('a');
      directLink.className = 'evidence-direct-link';
      directLink.href = entry.url || '#';
      directLink.target = '_blank';
      directLink.rel = 'noopener noreferrer';
      directLink.textContent = 'Open evidence directly';
      card.append(directLink);
      items.append(card);
    });
    modal.showModal();
  }));
  close.addEventListener('click', () => modal.close());
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.close(); });
})();
</script>
</body></html>
`
}

function renderEvidenceLinks(result: QaScenarioResult, scenarioTitle: string): string {
  if (result.evidence.length === 0) return '<span class="muted">None</span>'
  const evidence = result.evidence.map((item, index) => ({
    title: item.id || `Evidence ${index + 1}`,
    path: item.path,
    url: evidenceHref(item.path),
    kind: isImageEvidence(item.path) ? 'image' : 'document',
  }))
  const payload = escapeHtml(JSON.stringify(evidence))
  return '<a class="evidence-link" href="#evidence-modal" aria-haspopup="dialog" data-evidence-title="' + escapeHtml(`Evidence — ${scenarioTitle}`) + '" data-evidence="' + payload + '">' + (result.evidence.length === 1 ? 'View evidence' : `View evidence (${result.evidence.length})`) + '</a>'
}

function evidenceHref(path: string): string {
  const normalized = path.replaceAll(String.fromCharCode(92), '/')
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized) || normalized.startsWith('//') || normalized.split('/').includes('..')) return '#'
  return normalized.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

function isImageEvidence(path: string): boolean {
  const name = path.replaceAll(String.fromCharCode(92), '/').split('/').pop() ?? ''
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  return ['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(extension)
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
