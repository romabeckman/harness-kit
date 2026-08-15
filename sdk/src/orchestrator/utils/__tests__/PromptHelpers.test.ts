import { describe, it, expect } from 'vitest'
import {
  inlineOrReference,
  buildReworkSection,
  buildDocsOrientationSection,
  INLINE_THRESHOLD,
  FORCE_INLINE_MAX
} from '../PromptHelpers'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

describe('PromptHelpers', () => {
  describe('inlineOrReference', () => {
    it('returns empty array if content is undefined', () => {
      const result = inlineOrReference('test_label', undefined, '/path/to/file.md')
      expect(result).toEqual([])
    })

    it('omits content and only references file path by default (policy = "never")', () => {
      const content = 'Some content that should only be referenced'
      const result = inlineOrReference('spec_label', content, '/path/to/spec.md')
      expect(result).toEqual([
        '<spec_label_ref>',
        'Read file: `/path/to/spec.md`',
        '</spec_label_ref>'
      ])
    })

    it('inlines content when policy is "auto" and content length is <= INLINE_THRESHOLD (5000 chars)', () => {
      const content = 'a'.repeat(INLINE_THRESHOLD)
      const result = inlineOrReference('test_label', content, '/path/to/file.md', 'markdown', 'auto')
      expect(result).toEqual([
        '<test_label>',
        '```markdown',
        content,
        '```',
        '</test_label>'
      ])
    })

    it('references file path WITHOUT content when policy is "auto" and content length is > INLINE_THRESHOLD', () => {
      const content = 'a'.repeat(INLINE_THRESHOLD + 1)
      const result = inlineOrReference('test_label', content, '/path/to/file.md', 'markdown', 'auto')
      expect(result).toEqual([
        '<test_label_ref>',
        'Read file: `/path/to/file.md`',
        '</test_label_ref>'
      ])
    })

    it('inlines content when policy is "always" and content length is <= FORCE_INLINE_MAX (15000 chars)', () => {
      const content = 'a'.repeat(12000)
      const result = inlineOrReference('test_label', content, '/path/to/file.md', 'markdown', 'always')
      expect(result).toEqual([
        '<test_label>',
        '```markdown',
        content,
        '```',
        '</test_label>'
      ])
    })

    it('references file path WITHOUT content when policy is "always" but content length exceeds FORCE_INLINE_MAX', () => {
      const content = 'a'.repeat(FORCE_INLINE_MAX + 1)
      const result = inlineOrReference('test_label', content, '/path/to/file.md', 'markdown', 'always')
      expect(result).toEqual([
        '<test_label_ref>',
        'Read file: `/path/to/file.md`',
        '</test_label_ref>'
      ])
    })

    it('uses custom language tag when inlined and lang parameter is supplied', () => {
      const content = '{"key":"value"}'
      const result = inlineOrReference('json_label', content, '/path/to/file.json', 'json', 'auto')
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

    it('embeds file content via inlineOrReference in rework section when file exists on disk by default (policy = "always")', () => {
      const tempDir = join(tmpdir(), `rework-test-${Math.random().toString(36).slice(2)}`)
      mkdirSync(tempDir, { recursive: true })
      const filePath = join(tempDir, 'REWORK-LOG.md')
      writeFileSync(filePath, '### Action Items\n- [ ] Fix memory leak', 'utf-8')

      const result = buildReworkSection(filePath, 3, true)
      const joinedResult = result.join('\n')
      expect(joinedResult).toContain('<rework_history totalReworks="3">')
      expect(joinedResult).toContain('<rework_log_content>')
      expect(joinedResult).toContain('### Action Items\n- [ ] Fix memory leak')
      expect(joinedResult).toContain('</rework_log_content>')
      expect(joinedResult).toContain('<rework_directive round="3">')

      rmSync(tempDir, { recursive: true, force: true })
    })

    it('references file via inlineOrReference in rework section when policy is "never"', () => {
      const tempDir = join(tmpdir(), `rework-test-${Math.random().toString(36).slice(2)}`)
      mkdirSync(tempDir, { recursive: true })
      const filePath = join(tempDir, 'REWORK-LOG.md')
      writeFileSync(filePath, '### Action Items\n- [ ] Fix memory leak', 'utf-8')

      const result = buildReworkSection(filePath, 3, true, 'never')
      const joinedResult = result.join('\n')
      expect(joinedResult).toContain('<rework_history totalReworks="3">')
      expect(joinedResult).toContain('<rework_log_content_ref>')
      expect(joinedResult).toContain('Read file:')
      expect(joinedResult).toContain('</rework_log_content_ref>')
      expect(joinedResult).toContain('<rework_directive round="3">')

      rmSync(tempDir, { recursive: true, force: true })
    })

    it('references file without inlining when rework log exceeds FORCE_INLINE_MAX', () => {
      const tempDir = join(tmpdir(), `rework-test-${Math.random().toString(36).slice(2)}`)
      mkdirSync(tempDir, { recursive: true })
      const filePath = join(tempDir, 'REWORK-LOG.md')
      writeFileSync(filePath, 'a'.repeat(FORCE_INLINE_MAX + 100), 'utf-8')

      const result = buildReworkSection(filePath, 3, true, 'always')
      const joinedResult = result.join('\n')
      expect(joinedResult).toContain('<rework_history totalReworks="3">')
      expect(joinedResult).toContain('<rework_log_content_ref>')
      expect(joinedResult).not.toContain('<rework_log_content>')

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

    it('by default references both .digest.md and .graph.json (never policy)', () => {
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

    it('inlines .digest.md when digestPolicy is "auto"', () => {
      const tempDir = join(tmpdir(), `prompt-helpers-test-${Math.random().toString(36).slice(2)}`)
      const projDir = join(tempDir, 'proj-a')
      const docsDir = join(projDir, 'docs')
      mkdirSync(docsDir, { recursive: true })

      const digestText = '# Digest Summary\nArchitecture: Clean Architecture'
      const graphText = '{"nodes":[{"id":"doc:readme"}],"edges":[]}'

      writeFileSync(join(docsDir, '.digest.md'), digestText)
      writeFileSync(join(docsDir, '.graph.json'), graphText)

      const result = buildDocsOrientationSection([projDir], tempDir, 'auto', 'never')
      const joined = result.join('\n')

      expect(joined).toContain('<project_orientation')
      expect(joined).toContain('<digest_md>')
      expect(joined).toContain('# Digest Summary')
      expect(joined).toContain('<graph_json_ref>')
      expect(joined).toContain('</project_orientation>')

      rmSync(tempDir, { recursive: true, force: true })
    })

    it('inlines .graph.json when graphPolicy is "always"', () => {
      const tempDir = join(tmpdir(), `prompt-helpers-test-${Math.random().toString(36).slice(2)}`)
      const projDir = join(tempDir, 'proj-a')
      const docsDir = join(projDir, 'docs')
      mkdirSync(docsDir, { recursive: true })

      const digestText = '# Digest Summary'
      const graphText = '{"nodes":[{"id":"doc:readme"}],"edges":[]}'

      writeFileSync(join(docsDir, '.digest.md'), digestText)
      writeFileSync(join(docsDir, '.graph.json'), graphText)

      const result = buildDocsOrientationSection([projDir], tempDir, 'auto', 'always')
      const joined = result.join('\n')

      expect(joined).toContain('<digest_md>')
      expect(joined).toContain('<graph_json>')
      expect(joined).toContain('{"nodes":[{"id":"doc:readme"}],"edges":[]}')

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
      expect(joined).toContain('<digest_md_ref>')
      expect(joined).toContain('proj1')
      expect(joined).toContain('proj2')

      rmSync(tempDir, { recursive: true, force: true })
    })
  })
})

