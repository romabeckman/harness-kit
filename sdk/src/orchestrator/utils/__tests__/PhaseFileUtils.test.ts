import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { listSpecFiles, listDocFiles, readTddOutput, getProductDir, getSpecsDir } from '../../utils/PhaseFileUtils'

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
    it('returns UNKNOWN status when file does not exist', () => {
      const result = readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))

      expect(result.status).toBe('UNKNOWN')
      expect(result.rationale).toContain('not found')
    })

    it('parses a valid TDD-OUTPUT.json and includes metrics in rationale', () => {
      const output = {
        featureId: 'F001',
        status: 'SUCCESS',
        metrics: { totalTests: 10, passed: 9, failed: 1, coverage: 0.92 },
        modifiedFiles: ['src/index.ts', 'src/utils.ts'],
        reworksCount: 0,
      }
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), JSON.stringify(output))

      const result = readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))

      expect(result.status).toBe('SUCCESS')
      expect(result.rationale).toContain('10 total')
      expect(result.rationale).toContain('9 passed')
      expect(result.rationale).toContain('1 failed')
      expect(result.rationale).toContain('0.92')
      expect(result.rationale).toContain('src/index.ts')
    })

    it('truncates modified files list when more than 5 files', () => {
      const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts']
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), JSON.stringify({
        status: 'SUCCESS',
        metrics: { totalTests: 5, passed: 5, failed: 0, coverage: 1.0 },
        modifiedFiles: files,
        reworksCount: 1,
      }))

      const result = readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))

      expect(result.rationale).toContain('+2 more')
    })

    it('returns PARSE_ERROR status when file contains invalid JSON', () => {
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), '{ not valid json }')

      const result = readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))

      expect(result.status).toBe('PARSE_ERROR')
      expect(result.rationale).toContain('Failed to parse')
    })

    it('handles missing optional fields gracefully', () => {
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001' }))

      const result = readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))

      expect(result.status).toBe('UNKNOWN')
      expect(result.rationale).toContain('no metrics')
      expect(result.rationale).toContain('no modified files listed')
    })

    it('reports rework count from file', () => {
      writeFileSync(join(tmpDir, 'TDD-OUTPUT.json'), JSON.stringify({
        status: 'SUCCESS',
        metrics: { totalTests: 2, passed: 2, failed: 0, coverage: 1.0 },
        modifiedFiles: [],
        reworksCount: 3,
      }))

      const result = readTddOutput(join(tmpDir, 'TDD-OUTPUT.json'))

      expect(result.rationale).toContain('Reworks: 3')
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
