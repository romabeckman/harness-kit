import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import {
  listSpecFiles,
  listDocFiles,
  readTddOutput,
  summarizeTddOutput,
  getProductDir,
  getSpecsDir,
} from '../../utils/PhaseFileUtils'

function makeTempDir(): string {
  const dir = join(tmpdir(), `phase-file-utils-test-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('PhaseFileUtils', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // ─── listSpecFiles ────────────────────────────────────────────────────────

  describe('listSpecFiles', () => {
    it('returns empty array when directory does not exist', () => {
      expect(listSpecFiles('/nonexistent/path/xyz')).toEqual([])
    })

    it('returns only .md files sorted, excluding REWORK files', () => {
      writeFileSync(join(tmpDir, '001-problem-space.md'), '')
      writeFileSync(join(tmpDir, '003-backend-tactical-design.md'), '')
      writeFileSync(join(tmpDir, '004-backend-test-scenarios.md'), '')
      writeFileSync(join(tmpDir, 'REWORK-LOG.md'), '')
      writeFileSync(join(tmpDir, 'TL.json'), '')
      writeFileSync(join(tmpDir, 'QA.json'), '')

      expect(listSpecFiles(tmpDir)).toEqual([
        '001-problem-space.md',
        '003-backend-tactical-design.md',
        '004-backend-test-scenarios.md',
      ])
    })

    it('returns empty array when directory has no .md files', () => {
      writeFileSync(join(tmpDir, 'TL.json'), '{}')
      writeFileSync(join(tmpDir, 'QA.json'), '{}')

      expect(listSpecFiles(tmpDir)).toEqual([])
    })

    it('excludes all files starting with REWORK regardless of suffix', () => {
      writeFileSync(join(tmpDir, 'REWORK-LOG.md'), '')
      writeFileSync(join(tmpDir, 'REWORK-2.md'), '')
      writeFileSync(join(tmpDir, '003-backend-tactical-design.md'), '')

      const result = listSpecFiles(tmpDir)
      expect(result).toEqual(['003-backend-tactical-design.md'])
    })
  })

  // ─── listDocFiles ─────────────────────────────────────────────────────────

  describe('listDocFiles', () => {
    it('returns empty array when directory does not exist', () => {
      expect(listDocFiles('/nonexistent/docs/feature')).toEqual([])
    })

    it('returns full forward-slash paths for .md files', () => {
      writeFileSync(join(tmpDir, 'FEATURE_A.md'), '')
      writeFileSync(join(tmpDir, 'FEATURE_B.md'), '')
      writeFileSync(join(tmpDir, 'notes.txt'), '')

      const result = listDocFiles(tmpDir)
      expect(result).toHaveLength(2)
      result.forEach(p => {
        expect(p).not.toContain('\\')
        expect(p.endsWith('.md')).toBe(true)
      })
    })

    it('returns empty array when directory has no .md files', () => {
      writeFileSync(join(tmpDir, 'data.json'), '{}')

      expect(listDocFiles(tmpDir)).toEqual([])
    })
  })

  // ─── readTddOutput ────────────────────────────────────────────────────────

  describe('readTddOutput', () => {
    it('throws when file does not exist', () => {
      expect(() => readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))).toThrow('not found')
    })

    it('returns the typed TDD output contract', () => {
      const output = {
        featureId: 'F001',
        status: 'SUCCESS',
        metrics: { totalTests: 10, passed: 9, failed: 1, coverage: 0.92 },
        modifiedFiles: ['src/index.ts', 'src/utils.ts'],
        developerHandoff: 'Review retry handling.',
        reworksCount: 0,
      }
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), JSON.stringify(output))

      const result = readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))

      expect(result).toEqual(output)
    })

    it('throws when file contains invalid JSON', () => {
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), '{ not valid json }')

      expect(() => readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))).toThrow('Failed to parse')
    })

    it('rejects malformed contract fields', () => {
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001' }))

      expect(() => readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))).toThrow('Invalid TDD-OUTPUT.json')
    })
  })

  describe('summarizeTddOutput', () => {
    it('formats metrics and truncates modified files for audit logging', () => {
      const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts']
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), JSON.stringify({
        featureId: 'F001',
        status: 'SUCCESS',
        metrics: { totalTests: 5, passed: 5, failed: 0, coverage: 1.0 },
        modifiedFiles: files,
        developerHandoff: 'Ready for review.',
        reworksCount: 1,
      }))

      const result = summarizeTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))

      expect(result.status).toBe('SUCCESS')
      expect(result.rationale).toContain('5 total')
      expect(result.rationale).toContain('+2 more')
    })

    it('returns PARSE_ERROR without throwing for invalid JSON', () => {
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), '{ invalid }')

      const result = summarizeTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))

      expect(result.status).toBe('PARSE_ERROR')
      expect(result.rationale).toContain('Failed to parse')
    })
  })

  // ─── getProductDir ────────────────────────────────────────────────────────

  describe('getProductDir', () => {
    it('returns custom productDir when specified in config', () => {
      const context = {
        config: { productDir: '/custom/product' },
        workingDir: '/workspace',
      }
      expect(getProductDir(context as any)).toBe('/custom/product')
    })

    it('defaults to docs/product under workingDir when productDir is not configured', () => {
      const context = {
        config: {},
        workingDir: '/workspace',
      }
      expect(getProductDir(context as any)).toBe(join('/workspace', 'docs', 'product'))
    })
  })

  // ─── getSpecsDir ──────────────────────────────────────────────────────────

  describe('getSpecsDir', () => {
    it('returns docs/specs/{domain} under workingDir', () => {
      expect(getSpecsDir('/workspace', 'auth')).toBe(join('/workspace', 'docs', 'specs', 'auth'))
    })
  })
})
