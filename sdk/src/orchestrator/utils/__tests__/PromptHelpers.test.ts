import { describe, it, expect } from 'vitest'
import { inlineOrReference, buildReworkSection } from '../PromptHelpers'

describe('PromptHelpers', () => {
  describe('inlineOrReference', () => {
    it('returns empty array if content is undefined', () => {
      const result = inlineOrReference('test_label', undefined, '/path/to/file.md')
      expect(result).toEqual([])
    })

    it('inlines content if length is less than 3000 chars', () => {
      const content = 'Small content here'
      const result = inlineOrReference('test_label', content, '/path/to/file.md')
      expect(result).toEqual([
        '<test_label>',
        '```markdown',
        content,
        '```',
        '</test_label>'
      ])
    })

    it('references file path if content is 3000 chars or more', () => {
      const content = 'a'.repeat(3000)
      const result = inlineOrReference('test_label', content, '/path/to/file.md')
      expect(result).toEqual([
        '<test_label_ref>',
        'Read file: `/path/to/file.md` (content too large to inline — 3000 chars)',
        '</test_label_ref>'
      ])
    })
  })

  describe('buildReworkSection', () => {
    it('returns empty array if reworkLogExists is false', () => {
      const result = buildReworkSection('/path/to/rework.md', 1, false)
      expect(result).toEqual([])
    })

    it('builds rework section if reworkLogExists is true', () => {
      const result = buildReworkSection('/path/to/rework.md', 2, true)
      expect(result.length).toBeGreaterThan(0)
      const joinedResult = result.join('\n')
      expect(joinedResult).toContain('<rework_history totalReworks="2">')
      expect(joinedResult).toContain('Read the file `/path/to/rework.md`')
      expect(joinedResult).toContain('<rework_directive round="2">')
    })
  })
})
