import { describe, it, expect } from 'vitest'
import { inlineOrReference, buildReworkSection, buildDocsOrientationSection } from '../PromptHelpers'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

describe('PromptHelpers', () => {
  describe('inlineOrReference', () => {
    it('returns empty array if content is undefined', () => {
      const result = inlineOrReference('test_label', undefined, '/path/to/file.md')
      expect(result).toEqual([])
    })

    it('omits content and only references file path by default (allowInlineContent = false)', () => {
      const content = 'Some critical content that should not be inlined'
      const result = inlineOrReference('spec_label', content, '/path/to/spec.md')
      expect(result).toEqual([
        '<spec_label_ref>',
        'Read file: `/path/to/spec.md`',
        '</spec_label_ref>'
      ])
    })

    it('inlines content if allowInlineContent is true and length is less than 5000 chars', () => {
      const content = 'Small content here'
      const result = inlineOrReference('test_label', content, '/path/to/file.md', 'markdown', true)
      expect(result).toEqual([
        '<test_label>',
        '```markdown',
        content,
        '```',
        '</test_label>'
      ])
    })

    it('references file path and provides content if allowInlineContent is true and content is 5000 chars or more', () => {
      const content = 'a'.repeat(5000)
      const result = inlineOrReference('test_label', content, '/path/to/file.md', 'markdown', true)
      expect(result).toEqual([
        '<test_label_ref>',
        'Read file: `/path/to/file.md` (content too large to inline — 5000 chars)',
        '```markdown',
        content,
        '```',
        '</test_label_ref>'
      ])
    })

    it('uses custom language tag when allowInlineContent is true and lang parameter is supplied', () => {
      const content = '{"key":"value"}'
      const result = inlineOrReference('json_label', content, '/path/to/file.json', 'json', true)
      expect(result).toEqual([
        '<json_label>',
        '```json',
        content,
        '```',
        '</json_label>'
      ])
    })
  })

  describe('buildReworkSection', () => {
    it('returns empty array if reworkLogExists is false', () => {
      const result = buildReworkSection('/path/to/rework.md', 1, false)
      expect(result).toEqual([])
    })

    it('builds rework section with fallback file reference if file does not exist on disk', () => {
      const result = buildReworkSection('/path/to/nonexistent-rework.md', 2, true)
      expect(result.length).toBeGreaterThan(0)
      const joinedResult = result.join('\n')
      expect(joinedResult).toContain('<rework_history totalReworks="2">')
      expect(joinedResult).toContain('Read the file `/path/to/nonexistent-rework.md`')
      expect(joinedResult).toContain('<rework_directive round="2">')
    })

    it('embeds file content via inlineOrReference in rework section when file exists on disk and allowInlineContent is true', () => {
      const tempDir = join(tmpdir(), `rework-test-${Math.random().toString(36).slice(2)}`)
      mkdirSync(tempDir, { recursive: true })
      const filePath = join(tempDir, 'REWORK-LOG.md')
      writeFileSync(filePath, '### Action Items\n- [ ] Fix memory leak', 'utf-8')

      const result = buildReworkSection(filePath, 3, true, true)
      const joinedResult = result.join('\n')
      expect(joinedResult).toContain('<rework_history totalReworks="3">')
      expect(joinedResult).toContain('<rework_log_content>')
      expect(joinedResult).toContain('### Action Items\n- [ ] Fix memory leak')
      expect(joinedResult).toContain('</rework_log_content>')
      expect(joinedResult).toContain('<rework_directive round="3">')

      rmSync(tempDir, { recursive: true, force: true })
    })

    it('references file via inlineOrReference in rework section when allowInlineContent is false', () => {
      const tempDir = join(tmpdir(), `rework-test-${Math.random().toString(36).slice(2)}`)
      mkdirSync(tempDir, { recursive: true })
      const filePath = join(tempDir, 'REWORK-LOG.md')
      writeFileSync(filePath, '### Action Items\n- [ ] Fix memory leak', 'utf-8')

      const result = buildReworkSection(filePath, 3, true, false)
      const joinedResult = result.join('\n')
      expect(joinedResult).toContain('<rework_history totalReworks="3">')
      expect(joinedResult).toContain('<rework_log_content_ref>')
      expect(joinedResult).toContain('Read file:')
      expect(joinedResult).toContain('</rework_log_content_ref>')
      expect(joinedResult).toContain('<rework_directive round="3">')

      rmSync(tempDir, { recursive: true, force: true })
    })
  })

  describe('buildDocsOrientationSection', () => {
    it('returns empty array when neither docs/.digest.md nor docs/.graph.json exist', () => {
      const tempDir = join(tmpdir(), `prompt-helpers-test-${Math.random().toString(36).slice(2)}`)
      mkdirSync(tempDir, { recursive: true })

      const result = buildDocsOrientationSection([tempDir], tempDir)
      expect(result).toEqual([])

      rmSync(tempDir, { recursive: true, force: true })
    })

    it('injects docs/.digest.md and docs/.graph.json references by default', () => {
      const tempDir = join(tmpdir(), `prompt-helpers-test-${Math.random().toString(36).slice(2)}`)
      const projDir = join(tempDir, 'proj-a')
      const docsDir = join(projDir, 'docs')
      mkdirSync(docsDir, { recursive: true })

      const digestText = '# Digest Summary\nArchitecture: Clean Architecture'
      const graphText = '{"nodes":[{"id":"doc:readme"}],"edges":[]}'

      writeFileSync(join(docsDir, '.digest.md'), digestText)
      writeFileSync(join(docsDir, '.graph.json'), graphText)

      const result = buildDocsOrientationSection([projDir], tempDir)
      const joined = result.join('\n')

      expect(joined).toContain('<project_orientation')
      expect(joined).toContain('<digest_md_ref>')
      expect(joined).toContain('Read file:')
      expect(joined).toContain('<graph_json_ref>')
      expect(joined).toContain('</project_orientation>')

      rmSync(tempDir, { recursive: true, force: true })
    })

    it('injects inlined docs when allowInlineContent is true', () => {
      const tempDir = join(tmpdir(), `prompt-helpers-test-${Math.random().toString(36).slice(2)}`)
      const projDir = join(tempDir, 'proj-a')
      const docsDir = join(projDir, 'docs')
      mkdirSync(docsDir, { recursive: true })

      const digestText = '# Digest Summary\nArchitecture: Clean Architecture'
      const graphText = '{"nodes":[{"id":"doc:readme"}],"edges":[]}'

      writeFileSync(join(docsDir, '.digest.md'), digestText)
      writeFileSync(join(docsDir, '.graph.json'), graphText)

      const result = buildDocsOrientationSection([projDir], tempDir, true)
      const joined = result.join('\n')

      expect(joined).toContain('<project_orientation')
      expect(joined).toContain('<digest_md>')
      expect(joined).toContain('# Digest Summary')
      expect(joined).toContain('<graph_json>')
      expect(joined).toContain('{"nodes":[{"id":"doc:readme"}],"edges":[]}')
      expect(joined).toContain('</project_orientation>')

      rmSync(tempDir, { recursive: true, force: true })
    })

    it('handles multiple project paths separately', () => {
      const tempDir = join(tmpdir(), `prompt-helpers-test-${Math.random().toString(36).slice(2)}`)
      const proj1 = join(tempDir, 'proj1')
      const proj2 = join(tempDir, 'proj2')
      mkdirSync(join(proj1, 'docs'), { recursive: true })
      mkdirSync(join(proj2, 'docs'), { recursive: true })

      writeFileSync(join(proj1, 'docs', '.digest.md'), '# Digest 1')
      writeFileSync(join(proj2, 'docs', '.digest.md'), '# Digest 2')

      const result = buildDocsOrientationSection([proj1, proj2], tempDir)
      const joined = result.join('\n')

      expect(joined).toContain(`<project_orientation path="${proj1.replace(/\\/g, '\\\\')}">`.replace(/\\\\/g, '\\'))
      expect(joined).toContain('Read file:')
      expect(joined).toContain('proj1')
      expect(joined).toContain('proj2')

      rmSync(tempDir, { recursive: true, force: true })
    })
  })
})

