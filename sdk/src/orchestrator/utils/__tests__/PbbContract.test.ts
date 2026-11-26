import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validatePbbContract, type RefinementEvidence } from '../PbbContract'

const contract = readFileSync(resolve(__dirname, '../../../../../skills/pbb-design/references/output-contract.md'), 'utf8')
const example = contract.split('```markdown\n')[1].split('\n```')[0] + '\n\n## Frontend Screens & Visualization\nNone identified.\n'
const evidence: RefinementEvidence[] = [
  { id: 1, question: 'Which capability should ship first?', recommendation: 'Show levels in the list before offering the filter.', answer: 'Show levels in the list first, then add the filter.', answeredBy: 'human', status: 'Human validated' },
  { id: 2, question: 'How should the filter handle courses without a level?', recommendation: 'Include only courses with the selected level.', answer: 'Unresolved', answeredBy: 'unresolved', status: 'Deferred', humanStatement: 'We will decide that with the catalogue team later.' },
]

describe('PBB contract validation', () => {
  it('accepts the standalone reference and bold field labels', () => {
    expect(validatePbbContract(example, evidence)).toEqual([])
    expect(validatePbbContract(example.replace('Suggested answer:', '**Suggested answer:**'), evidence)).toEqual([])
  })

  it('rejects lost or rewritten human decisions during autonomous consolidation', () => {
    expect(validatePbbContract(example, evidence)).toEqual([])
    expect(validatePbbContract(example.replace('Status: Deferred', 'Status: Unknown'), evidence).join('\n')).toMatch(/Q02/)
    expect(validatePbbContract(example.replace('Human statement: We will decide that with the catalogue team later.', ''), evidence).join('\n')).toMatch(/Q02/)
  })

  it('rejects setup answers represented as business decisions', () => {
    const setup: RefinementEvidence[] = [
      { id: 1, question: 'Setup?', answer: 'Answer', answeredBy: 'human', status: 'Human validated', category: 'setup' },
    ]
    expect(validatePbbContract(example, setup).join('\n')).toMatch(/Q01.*setup/i)
  })

  it('accepts unknown priority independently from the journey step and refinement state', () => {
    const pending = example
      .replace('Journey step: 1\nDelivery rank: 1\nPriority status: confirmed', 'Journey step: 2\nDelivery rank: null\nPriority status: pending')
      .replace('Priority reason: S01 and Q01 establish showing levels as the first release.', 'Priority reason: The comparative impact is unknown.')
    expect(validatePbbContract(pending, evidence)).toEqual([])
  })

  it('accepts a justified tie without deriving priority from file order', () => {
    const tied = example.replace('Delivery rank: 2', 'Delivery rank: 1')
      .replace('Priority reason: The decision maker placed filtering after showing levels in Q01.', 'Priority reason: Q01 establishes both outcomes as equally urgent.')
    expect(validatePbbContract(tied, evidence)).toEqual([])
  })

  it.each([
    ['', /section|heading/i],
    ['{}', /section|heading/i],
    [example.replace('PBB-Contract: 2', ''), /marker/i],
    [example.replace('Functionality: FN01', 'Functionality: FN99'), /FN99/],
    [example.replace('Benefit: FN01', 'Benefit: FN99'), /FN99/],
    [example.replace('Functionality: FN01', 'Functionality: FN01, FN01'), /Functionality/],
    [example.replace('S01 and Q01 establish', 'S99 and Q01 establish'), /S99/],
    [example.replace('Problems: [PR01]', 'Problems: [PR01, missing]'), /Problems/],
    [example.replace('### PBI02', '### PBI01'), /duplicate/i],
    [example.replace('Priority status: confirmed', 'Priority status: pending'), /rank/i],
    [example.replace('Priority reason: S01 and Q01 establish showing levels as the first release.', 'Priority reason: It should come first.'), /Priority reason/],
    [example.replace('Answered by: unresolved', 'Answered by: human'), /status|author/i],
    [example.replace('| PBI02 | FN01 | PE01 | PR01 | EX01 | Q01, Q02 |', ''), /traceability/i],
    [example.slice(0, -40), /frontend|visualization/i],
  ])('rejects an invalid candidate with an identifiable reason', (input, reason) => {
    expect(validatePbbContract(input, evidence).join('\n')).toMatch(reason)
  })
})
