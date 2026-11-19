import { describe, expect, it } from 'vitest'
import { loadPrompt, renderPrompt } from '../PromptTemplate'

describe('prompt templates', () => {
  it('renders literal values in one pass and rejects missing values', () => {
    expect(renderPrompt('test', 'Hello {{name}}. {{name}}', { name: '{{other}} $&' }))
      .toBe('Hello {{other}} $&. {{other}} $&')
    expect(() => renderPrompt('test', '{{missing}}', {})).toThrow(/test.*missing/)
  })

  it('inserts optional line arrays without adding blank lines', () => {
    expect(renderPrompt('test', 'before\n{{*lines}}\nafter', { lines: [] })).toBe('before\nafter')
    expect(renderPrompt('test', 'before\n{{*lines}}\nafter', { lines: ['one', 'two'] })).toBe('before\none\ntwo\nafter')
  })

  it('loads a packaged template without adding the file terminator to the prompt', () => {
    expect(loadPrompt('refinement/questions-static', {})).toMatch(/<\/output_format>$/)
  })
})
