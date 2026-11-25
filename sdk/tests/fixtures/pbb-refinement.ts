import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface Evidence {
  id: number
  question: string
  recommendation?: string
  context?: string
  answer: string
  answeredBy: string
  status: string
  category?: string
  humanStatement?: string
}

export function refinementForPrompt(prompt: string, contractText?: string): string {
  const evidence = JSON.parse(prompt.match(/^<refinement_evidence>\s*([\s\S]*?)\s*<\/refinement_evidence>/m)![1]) as Evidence[]
  const contract = contractText ?? readFileSync(resolve(__dirname, '../../../skills/pbb-design/references/output-contract.md'), 'utf8')
  const example = contract.split('```markdown\n')[1].split('\n```')[0]
  const clean = example.split('## 9. Open Questions')[0]
    .replace(/Decision refs: \[[^\]]*\]/g, 'Decision refs: []')
    .replace('| PBI01 | FN01 | PE01 | PR01 | EX01 | Q01 |', '| PBI01 | FN01 | PE01 | PR01 | EX01 | [] |')
    .replace('| PBI02 | FN01 | PE01 | PR01 | EX01 | Q01, Q02 |', '| PBI02 | FN01 | PE01 | PR01 | EX01 | [] |')
    .replace('S01 and Q01 establish showing levels as the first release.', 'S01 establishes showing levels as the first release.')
    .replace('The decision maker placed filtering after showing levels in Q01.', 'S01 establishes showing levels as the first release.')
    .replace(' Q02 determines how the filter handles courses without a level.', '')
    .replace('Clarify Q02 before specifying the complete filter result.', 'Clarify the filter result before refinement.')
  const questions = evidence.filter(entry => entry.category !== 'setup').map(entry => [
    `### Q${String(entry.id).padStart(2, '0')} — ${entry.question}`,
    `Suggested answer: ${entry.recommendation ?? 'null'}`,
    `Rationale: ${entry.context ?? 'Additional context supplied by the user.'}`,
    `Resolved answer: ${entry.answer}`,
    `Answered by: ${entry.answeredBy}`,
    `Status: ${entry.status}`,
    ...(entry.humanStatement ? [`Human statement: ${entry.humanStatement}`] : []),
    'Affects: []',
    'Impact: Recorded context.',
  ].join('\n')).join('\n\n')
  return `${clean}## 9. Open Questions\n${questions || 'No open questions.'}\n\n## Frontend Screens & Visualization\nNone identified.\n`
}
