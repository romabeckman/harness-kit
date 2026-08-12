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

    it('references file path and provides content if content is 5000 chars or more', () => {
      const content = 'a'.repeat(5000)
      const result = inlineOrReference('test_label', content, '/path/to/file.md')
      expect(result).toEqual([
        '<test_label_ref>',
        'Read file: `/path/to/file.md` (content too large to inline — 5000 chars)',
        '```markdown',
        content,
        '```',
        '</test_label_ref>'
      ])
    })

    it('uses custom language tag when lang parameter is supplied', () => {
      const content = '{"key":"value"}'
      const result = inlineOrReference('json_label', content, '/path/to/file.json', 'json')
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

    it('builds rework section if reworkLogExists is true', () => {
      const result = buildReworkSection('/path/to/rework.md', 2, true)
      expect(result.length).toBeGreaterThan(0)
      const joinedResult = result.join('\n')
      expect(joinedResult).toContain('<rework_history totalReworks="2">')
      expect(joinedResult).toContain('Read the file `/path/to/rework.md`')
      expect(joinedResult).toContain('<rework_directive round="2">')
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

    it('injects docs/.digest.md and docs/.graph.json when present for a project path', () => {
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
      expect(joined).toContain('# Digest 1')
      expect(joined).toContain('# Digest 2')

      rmSync(tempDir, { recursive: true, force: true })
    })
  })
})

