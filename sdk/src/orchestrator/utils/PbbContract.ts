import type { RefinementEvidence } from '../../file-state/types'

export type { RefinementEvidence } from '../../file-state/types'

const headings = [
  '1. Product', '2. Problems', '3. Expectations', '4. Personas',
  '5. Functionalities', '6. Product Backlog', '7. Traceability',
  '8. Assumptions', '9. Open Questions', 'Frontend Screens & Visualization',
]

const requiredFields: Record<string, string[]> = {
  PR: ['Basis'],
  EX: ['Problems', 'Basis'],
  PE: ['Current activity', 'Desired activity', 'Problems', 'Expectations', 'Basis'],
  FN: ['Personas', 'Problems', 'Expectations', 'Benefit', 'Basis'],
  PBI: ['Functionality', 'Persona', 'Problem', 'Expectation', 'Outcome', 'Benefit',
    'Journey step', 'Delivery rank', 'Priority status', 'Priority reason', 'Basis',
    'Decision refs', 'Refinement state', 'Next action'],
  A: ['Statement', 'Basis', 'Affects', 'Validation'],
  Q: ['Suggested answer', 'Rationale', 'Resolved answer', 'Answered by', 'Status', 'Affects', 'Impact'],
}

const fieldTypes: Record<string, string[]> = {
  Basis: ['S', 'Q', 'A'], Problems: ['PR'], Expectations: ['EX'], Personas: ['PE'],
  Functionality: ['FN'], Persona: ['PE'], Problem: ['PR'], Expectation: ['EX'],
  'Additional problems': ['PR'], 'Additional expectations': ['EX'],
  'Decision refs': ['Q', 'A'], Supersedes: ['Q'],
  Affects: ['PR', 'EX', 'PE', 'FN', 'PBI', 'A', 'Q'],
}

interface RecordBlock {
  id: string
  prefix: string
  title?: string
  fields: Map<string, string>
}

function field(line: string): [string, string] | undefined {
  const match = line.match(/^(?:\*\*)?([^:*]+?)(?::\*\*|\*\*:|:)\s*(.*)$/)
  return match ? [match[1].trim(), match[2].trim()] : undefined
}

function ids(value: string): string[] {
  return value.match(/\b(?:PBI|PR|EX|PE|FN|S|Q|A)\d{2,}\b/g) ?? []
}

const questionTextFields = ['Suggested answer', 'Rationale', 'Resolved answer', 'Human statement']

function decodeQuestionText(block: RecordBlock, errors: string[]): void {
  for (const key of questionTextFields) {
    const value = block.fields.get(key)
    if (!value?.startsWith('json:"')) continue
    try {
      const decoded: unknown = JSON.parse(value.slice(5))
      if (typeof decoded !== 'string') throw new Error('Expected a JSON string')
      block.fields.set(key, decoded)
    } catch {
      errors.push(`${block.id}: invalid JSON string in ${key}`)
    }
  }
}

export function validatePbbContract(markdown: string, evidence: RefinementEvidence[] = []): string[] {
  const errors: string[] = []
  const sections = new Map<string, string[]>()
  let section = ''
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      section = heading[1]
      if (sections.has(section)) errors.push(`Duplicate section: ${section}`)
      sections.set(section, [])
    } else if (section) sections.get(section)?.push(line)
  }
  if (JSON.stringify([...sections.keys()]) !== JSON.stringify(headings)) {
    errors.push('Expected all required sections in order, including Frontend Screens & Visualization')
  }
  const product = sections.get(headings[0]) ?? []
  if (!product.includes('PBB-Contract: 2')) errors.push('Missing PBB-Contract: 2 marker')
  const productFields = new Map(product.map(field).filter((entry): entry is [string, string] => !!entry))
  for (const key of ['Intent', 'In scope', 'Boundaries', 'Sources']) {
    if (!productFields.has(key) || (key !== 'Sources' && !productFields.get(key))) errors.push(`Product missing ${key}`)
  }
  if (!(sections.get(headings[9]) ?? []).some(line => line.trim())) errors.push('Frontend visualization section is empty')

  const known = new Map<string, RecordBlock>()
  const sourceLines = product.filter(line => /^-\s+S\d{2,}\s+—\s+\S/.test(line))
  for (const line of sourceLines) {
    const id = line.match(/^-\s+(S\d{2,})/)![1]
    if (known.has(id)) errors.push(`Duplicate ID ${id}`)
    known.set(id, { id, prefix: 'S', fields: new Map() })
  }
  if (productFields.get('Sources') !== '[]' && sourceLines.length === 0) errors.push('Sources have no valid entries')

  const sectionPrefixes: Record<string, string> = {
    [headings[1]]: 'PR', [headings[2]]: 'EX', [headings[3]]: 'PE',
    [headings[4]]: 'FN', [headings[5]]: 'PBI', [headings[7]]: 'A', [headings[8]]: 'Q',
  }
  for (const [sectionName, prefix] of Object.entries(sectionPrefixes)) {
    let current: RecordBlock | undefined
    for (const line of sections.get(sectionName) ?? []) {
      if (line.startsWith('### ')) {
        const match = line.match(/^###\s+(PBI|PR|EX|PE|FN|A|Q)(\d{2,})\s+—\s+\S/)
        if (!match || match[1] !== prefix || Number(match[2]) === 0) {
          errors.push(`Invalid record heading in ${sectionName}: ${line}`)
          current = undefined
          continue
        }
        const id = match[1] + match[2]
        if (known.has(id)) errors.push(`Duplicate ID ${id}`)
        current = { id, prefix, title: line.replace(/^###\s+\S+\s+—\s+/, ''), fields: new Map() }
        known.set(id, current)
      } else if (current) {
        const entry = field(line)
        if (entry) {
          if (current.fields.has(entry[0])) errors.push(`${current.id}: duplicate field ${entry[0]}`)
          current.fields.set(...entry)
        }
      }
    }
  }
  const blocks = [...known.values()].filter(block => block.prefix !== 'S')
  for (const block of blocks) {
    if (block.prefix === 'Q') decodeQuestionText(block, errors)
    for (const key of requiredFields[block.prefix]) {
      if (!block.fields.get(key)) errors.push(`${block.id}: missing ${key}`)
    }
    for (const [key, value] of block.fields) {
      const types = fieldTypes[key]
      const pbiCitesEvidence = block.prefix === 'PBI' &&
        (key === 'Priority reason' || (key === 'Benefit' && /^FN\d{2,}$/.test(value)))
      if (!types && !pbiCitesEvidence) continue
      const references = ids(value)
      if (types) {
        const scalar = ['Functionality', 'Persona', 'Problem', 'Expectation'].includes(key)
        const validList = /^\[(?:\s*(?:PBI|PR|EX|PE|FN|S|Q|A)\d{2,}(?:\s*,\s*(?:PBI|PR|EX|PE|FN|S|Q|A)\d{2,})*\s*)?\]$/.test(value)
        if (scalar ? !(value === 'null' || /^(?:PBI|PR|EX|PE|FN|S|Q|A)\d{2,}$/.test(value)) : !validList) {
          errors.push(`${block.id}: invalid ${key}`)
        }
      }
      for (const id of references) {
        const target = known.get(id)
        if (!target) errors.push(`${block.id}: missing reference ${id}`)
        else if (types && !types.includes(target.prefix)) errors.push(`${block.id}: invalid ${key} reference ${id}`)
      }
    }
    if (block.prefix === 'PBI') validatePbi(block, errors)
    if (block.prefix === 'Q') validateQuestion(block, errors)
  }

  const evidenceById = new Map(evidence.map(answer => [`Q${String(answer.id).padStart(2, '0')}`, answer]))
  if (evidenceById.size !== evidence.length) errors.push('Duplicate question ID in refinement evidence')
  const questions = blocks.filter(block => block.prefix === 'Q')
  for (const question of questions) {
    if (!evidenceById.has(question.id) && (question.fields.get('Answered by') !== 'model' || question.fields.has('Human statement'))) {
      errors.push(`${question.id}: decision requires recorded refinement evidence`)
    }
  }

  const pbis = blocks.filter(block => block.prefix === 'PBI')
  for (const pbi of pbis) {
    const status = pbi.fields.get('Priority status')
    const references = ids(pbi.fields.get('Priority reason') ?? '')
    if (status === 'confirmed' && !references.some(id => {
      const source = known.get(id)
      const answer = evidenceById.get(id)
      return source?.prefix === 'S' || (source?.prefix === 'Q' && answer?.category !== 'setup' && answer?.status === 'Human validated')
    })) errors.push(`${pbi.id}: Priority reason requires a source or human decision`)
    if (status === 'proposed' && !references.some(id => ['A', 'Q'].includes(known.get(id)?.prefix ?? ''))) {
      errors.push(`${pbi.id}: Priority reason requires a referenced inference`)
    }
  }
  if (pbis.length === 0) errors.push('Product Backlog has no PBI records')
  const trace = sections.get(headings[6]) ?? []
  const rows = trace.filter(line => /^\|/.test(line.trim())).map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()))
  if (JSON.stringify(rows[0]) !== JSON.stringify(['PBI', 'Functionality', 'Persona', 'Problem', 'Expectation', 'Decisions'])) errors.push('Invalid Traceability columns')
  const dataRows = rows.slice(2)
  for (const pbi of pbis) {
    const found = dataRows.filter(row => row[0] === pbi.id)
    if (found.length !== 1) {
      errors.push(`${pbi.id}: missing or duplicate Traceability row`)
      continue
    }
    const expected = [
      pbi.fields.get('Functionality'), pbi.fields.get('Persona'),
      [pbi.fields.get('Problem'), ...ids(pbi.fields.get('Additional problems') ?? '')].filter(Boolean).join(', '),
      [pbi.fields.get('Expectation'), ...ids(pbi.fields.get('Additional expectations') ?? '')].filter(Boolean).join(', '),
      ids(pbi.fields.get('Decision refs') ?? '').join(', ') || '[]',
    ]
    if (JSON.stringify(found[0].slice(1)) !== JSON.stringify(expected)) errors.push(`${pbi.id}: Traceability does not match PBI`)
    const decisions = ids(pbi.fields.get('Decision refs') ?? '')
    for (const decision of blocks.filter(block => ['Q', 'A'].includes(block.prefix))) {
      const affects = ids(decision.fields.get('Affects') ?? '').includes(pbi.id)
      if (affects !== decisions.includes(decision.id)) errors.push(`${pbi.id}: inconsistent decision ${decision.id}`)
    }
  }
  for (const row of dataRows) if (!pbis.some(pbi => pbi.id === row[0])) errors.push(`Unknown Traceability PBI ${row[0]}`)
  const questionSection = (sections.get(headings[8]) ?? []).join('\n').trim()
  if (questions.length === 0 && questionSection !== 'No open questions.') errors.push('Open Questions has no valid history or empty marker')
  if (questions.length > 0 && questionSection.includes('No open questions.')) errors.push('Open Questions contains history and empty marker')
  for (const [id, answer] of evidenceById) {
    const question = known.get(id)
    if (answer.category === 'setup') {
      if (question) errors.push(`${id}: setup answer cannot be a business question`)
      continue
    }
    if (!question || question.title !== answer.question) {
      errors.push(`${id}: missing original question`)
      continue
    }
    const expected: Record<string, string | undefined> = {
      'Resolved answer': answer.answer,
      'Answered by': answer.answeredBy,
      Status: answer.status,
      'Suggested answer': answer.recommendation,
      Rationale: answer.context,
      'Human statement': answer.humanStatement,
    }
    for (const [key, value] of Object.entries(expected)) {
      if ((value !== undefined || key === 'Human statement') && question.fields.get(key) !== value) {
        errors.push(`${id}: ${key} differs from refinement evidence`)
      }
    }
  }
  return errors
}

function validatePbi(block: RecordBlock, errors: string[]): void {
  const get = (name: string) => block.fields.get(name) ?? ''
  for (const name of ['Journey step', 'Delivery rank']) {
    if (get(name) !== 'null' && !/^[1-9]\d*$/.test(get(name))) errors.push(`${block.id}: invalid ${name}`)
  }
  const status = get('Priority status')
  if (!['confirmed', 'proposed', 'pending'].includes(status) ||
      (status === 'pending') !== (get('Delivery rank') === 'null')) errors.push(`${block.id}: inconsistent priority status and rank`)
  if (!['ready_for_refinement', 'needs_clarification'].includes(get('Refinement state'))) errors.push(`${block.id}: invalid refinement state`)
}

function validateQuestion(block: RecordBlock, errors: string[]): void {
  const author = block.fields.get('Answered by')
  const status = block.fields.get('Status')
  const answer = block.fields.get('Resolved answer')
  const valid = (author === 'human' && status === 'Human validated' && answer !== 'Unresolved') ||
    (author === 'model' && status === 'Provisional model assumption' && answer !== 'Unresolved') ||
    (author === 'unresolved' && ['Deferred', 'Unknown'].includes(status ?? '') && answer === 'Unresolved')
  if (!valid) errors.push(`${block.id}: inconsistent author, status, or answer`)
}
