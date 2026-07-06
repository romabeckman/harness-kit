import { describe, it, expect } from 'vitest'
import { BacklogParser } from '../BacklogParser'

const HEADER = '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'

describe('BacklogParser', () => {
  it('parses backend layer', () => {
    const md = HEADER + '| **F001** | **Auth** | auth | backend | HIGH | None | 0 | - | - | NOT_STARTED |\n'
    const [f] = BacklogParser.parse(md)
    expect(f.layer).toBe('backend')
  })

  it('parses frontend layer', () => {
    const md = HEADER + '| **F002** | **Dashboard** | dashboard | frontend | MEDIUM | None | 0 | - | - | NOT_STARTED |\n'
    const [f] = BacklogParser.parse(md)
    expect(f.layer).toBe('frontend')
  })

  it('parses qa layer', () => {
    const md = HEADER + '| **F003** | **QA Suite** | qa_suite | qa | LOW | None | 0 | - | - | NOT_STARTED |\n'
    const [f] = BacklogParser.parse(md)
    expect(f.layer).toBe('qa')
  })

  it('returns null for unknown or omitted layer values', () => {
    const md = HEADER + '| **F004** | **Widget** | widget | unknown_value | LOW | None | 0 | - | - | NOT_STARTED |\n'
    const [f] = BacklogParser.parse(md)
    expect(f.layer).toBeNull()
  })

  it('parses all other fields correctly with new column', () => {
    const md = HEADER + '| **F001** | **Auth** | `auth` | `backend` | HIGH | F000 | 2 | 0.85 | 0.90 | COMPLETED |\n'
    const [f] = BacklogParser.parse(md)
    expect(f.id).toBe('F001')
    expect(f.title).toBe('Auth')
    expect(f.domain).toBe('auth')
    expect(f.layer).toBe('backend')
    expect(f.dependencies).toEqual(['F000'])
    expect(f.reworks).toBe(2)
    expect(f.scoreTL).toBe(0.85)
    expect(f.scoreAdv).toBe(0.90)
    expect(f.status).toBe('COMPLETED')
  })

  it('skips malformed rows gracefully', () => {
    const md = HEADER + '| incomplete |\n'
    expect(BacklogParser.parse(md)).toHaveLength(0)
  })
})
