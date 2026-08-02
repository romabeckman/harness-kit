import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FileStateManager } from '../../src/file-state/FileStateManager'
import type { Task } from '../../src/file-state/types'

let tmpDir: string
let productDir: string
let mgr: FileStateManager

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'harness-sdk-test-'))
  productDir = join(tmpDir, 'docs', 'product')
  mkdirSync(productDir, { recursive: true })
  mgr = new FileStateManager({ productDir, workingDir: tmpDir })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('T07 — FileStateManager', () => {
  describe('TS-I-01: ensureProductFiles creates all four files when none exist', () => {
    it('creates BACKLOG.md, DEVELOPMENT-STATE.md, DECISIONS.md, BOOTSTRAP-CONFIG.json', () => {
      mgr.ensureProductFiles()
      expect(existsSync(join(productDir, 'BACKLOG.md'))).toBe(true)
      expect(existsSync(join(productDir, 'DEVELOPMENT-STATE.md'))).toBe(true)
      expect(existsSync(join(productDir, 'DECISIONS.md'))).toBe(true)
      expect(existsSync(join(productDir, 'BOOTSTRAP-CONFIG.json'))).toBe(true)
    })
  })

  describe('TS-I-02: ensureProductFiles is idempotent', () => {
    it('does not overwrite existing files', () => {
      mgr.ensureProductFiles()
      // mutate one file
      writeFileSync(join(productDir, 'DECISIONS.md'), '# Custom Content')
      mgr.ensureProductFiles()
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      expect(content).toBe('# Custom Content')
    })
  })

  describe('TS-I-03: loadBacklog parses valid BACKLOG.md', () => {
    it('returns Feature[] of length 3 with correct values', () => {
      mgr.ensureProductFiles()
      // Write a BACKLOG with 3 rows
      const md = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | Alpha | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
        '| F002 | Beta | sdk_core | backend | 2 | F001 | 0 | - | - | NOT_STARTED |',
        '| F003 | Gamma | sdk_core | backend | 3 | - | 0 | - | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), md)
      const features = mgr.loadBacklog()
      expect(features).toHaveLength(3)
      expect(features[0].id).toBe('F001')
    })
  })

  describe('TS-I-04: loadBacklog returns empty array for header-only file', () => {
    it('returns []', () => {
      const md = '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
      writeFileSync(join(productDir, 'BACKLOG.md'), md)
      expect(mgr.loadBacklog()).toEqual([])
    })
  })

  describe('TS-I-05: updateFeatureStatus updates correct row only', () => {
    it('updates F002 row, leaves F001 and F003 unchanged', () => {
      const md = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | Alpha | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
        '| F002 | Beta | sdk_core | backend | 2 | F001 | 0 | - | - | NOT_STARTED |',
        '| F003 | Gamma | sdk_core | backend | 3 | - | 0 | - | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), md)
      mgr.updateFeatureStatus('F002', 'COMPLETED', { tl: 0.85, adv: 0.80 })
      const features = mgr.loadBacklog()
      expect(features.find(f => f.id === 'F001')?.status).toBe('NOT_STARTED')
      expect(features.find(f => f.id === 'F002')?.status).toBe('COMPLETED')
      expect(features.find(f => f.id === 'F002')?.scoreTL).toBe(0.85)
      expect(features.find(f => f.id === 'F002')?.scoreAdv).toBe(0.80)
      expect(features.find(f => f.id === 'F003')?.status).toBe('NOT_STARTED')
    })
  })

  describe('TS-I-06: incrementReworks increments only target', () => {
    it('F002 reworks increments, F001 unchanged', () => {
      const md = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | Alpha | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
        '| F002 | Beta | sdk_core | backend | 2 | F001 | 1 | - | - | IN_PROGRESS |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), md)
      mgr.incrementReworks('F002')
      const features = mgr.loadBacklog()
      expect(features.find(f => f.id === 'F001')?.reworks).toBe(0)
      expect(features.find(f => f.id === 'F002')?.reworks).toBe(2)
    })
  })

  describe('TS-I-07: loadBootstrapConfig returns typed object', () => {
    it('returns correct thresholds', () => {
      mgr.ensureProductFiles()
      const cfg = mgr.loadBootstrapConfig()
      expect(cfg.scoreThresholdTL).toBe(0.70)
      expect(cfg.scoreThresholdAdv).toBe(0.70)
      expect(cfg.completionCriteria.maxReworks).toBe(2)
    })
  })

  describe('TS-I-08: saveBootstrapConfig persists cycleCounter', () => {
    it('completedCycles=3 persisted and re-read', () => {
      mgr.ensureProductFiles()
      const cfg = mgr.loadBootstrapConfig()
      mgr.saveBootstrapConfig({ ...cfg, cycleCounter: { completedCycles: 3 } })
      const updated = mgr.loadBootstrapConfig()
      expect(updated.cycleCounter.completedCycles).toBe(3)
    })
  })

  describe('TS-I-09: appendDecision appends to existing DECISIONS.md', () => {
    it('file contains both prior and new entry', () => {
      const prior = '# Decisions\n\n| Timestamp | Feature | Decision | Scores | Rationale |\n| --- | --- | --- | --- | --- |\n'
      writeFileSync(join(productDir, 'DECISIONS.md'), prior)
      mgr.appendDecision({ featureId: 'F001', decision: 'Feature F001 ACCEPTED' })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      expect(content).toContain('Timestamp')
      expect(content).toContain('Feature F001 ACCEPTED')
    })
  })

  describe('TS-I-10: appendDecision creates DECISIONS.md if absent', () => {
    it('creates file with entry, no error', () => {
      const decisionsPath = join(productDir, 'DECISIONS.md')
      if (existsSync(decisionsPath)) rmSync(decisionsPath)
      expect(() => mgr.appendDecision({ featureId: null, decision: 'First entry.' })).not.toThrow()
      expect(existsSync(decisionsPath)).toBe(true)
      expect(readFileSync(decisionsPath, 'utf-8')).toContain('First entry.')
    })
  })

  describe('TS-I-11: appendTasks adds rows to DEVELOPMENT-STATE.md', () => {
    it('two new rows added correctly', () => {
      const md = '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |\n| --- | --- | --- | --- | --- | --- | --- |'
      writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), md)
      const tasks: Task[] = [
        { featureId: 'F001', taskId: 'T01', project: 'sdk', description: 'task one', domain: 'sdk_core', currentPhase: '-', status: 'NOT_STARTED' },
        { featureId: 'F001', taskId: 'T02', project: 'sdk', description: 'task two', domain: 'sdk_core', currentPhase: '-', status: 'NOT_STARTED' },
      ]
      mgr.appendTasks(tasks)
      const loaded = mgr.loadDevelopmentState()
      expect(loaded).toHaveLength(2)
      expect(loaded[0].taskId).toBe('T01')
      expect(loaded[1].taskId).toBe('T02')
    })
  })

  describe('TS-I-12: updateTaskStatus updates correct task row', () => {
    it('only T02 row updated', () => {
      const md = [
        '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | T01 | sdk | task one | sdk_core | - | NOT_STARTED |',
        '| F001 | T02 | sdk | task two | sdk_core | - | NOT_STARTED |',
        '| F001 | T03 | sdk | task three | sdk_core | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), md)
      mgr.updateTaskStatus('F001', 'T02', 'IMPLEMENTATION', 'IN_PROGRESS')
      const tasks = mgr.loadDevelopmentState()
      expect(tasks.find(t => t.taskId === 'T01')?.status).toBe('NOT_STARTED')
      expect(tasks.find(t => t.taskId === 'T02')?.status).toBe('IN_PROGRESS')
      expect(tasks.find(t => t.taskId === 'T02')?.currentPhase).toBe('IMPLEMENTATION')
      expect(tasks.find(t => t.taskId === 'T03')?.status).toBe('NOT_STARTED')
    })
  })

  describe('TS-I-13: updateAllFeatureTasks updates all tasks for a feature atomically', () => {
    it('all F001 tasks updated, F002 unchanged', () => {
      const md = [
        '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | T01 | sdk | task one | sdk_core | - | NOT_STARTED |',
        '| F001 | T02 | sdk | task two | sdk_core | - | NOT_STARTED |',
        '| F002 | T03 | sdk | task three | sdk_core | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), md)
      mgr.updateAllFeatureTasks('F001', 'VALIDATION', 'IN_PROGRESS')
      const tasks = mgr.loadDevelopmentState()
      expect(tasks.find(t => t.taskId === 'T01')?.currentPhase).toBe('VALIDATION')
      expect(tasks.find(t => t.taskId === 'T01')?.status).toBe('IN_PROGRESS')
      expect(tasks.find(t => t.taskId === 'T02')?.status).toBe('IN_PROGRESS')
      expect(tasks.find(t => t.taskId === 'T03')?.status).toBe('NOT_STARTED')
    })
  })

  describe('TS-I-14: writeReworkLog creates REWORK-LOG.md under correct domain path', () => {
    it('creates docs/specs/sdk_core/REWORK-LOG.md', () => {
      mgr.writeReworkLog('sdk_core', 'open points: test failures')
      const logPath = join(tmpDir, 'docs', 'specs', 'sdk_core', 'REWORK-LOG.md')
      expect(existsSync(logPath)).toBe(true)
      expect(readFileSync(logPath, 'utf-8')).toContain('open points: test failures')
    })
  })

  describe('TS-I-21: updateFeatureStatus throws on unknown featureId', () => {
    it('throws Error("Feature not found: NONEXISTENT") when id absent from BACKLOG.md', () => {
      const md = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | Alpha | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), md)
      expect(() => mgr.updateFeatureStatus('NONEXISTENT', 'COMPLETED')).toThrow('Feature not found: NONEXISTENT')
    })
  })

  describe('TS-I-22: incrementReworks throws on unknown featureId', () => {
    it('throws Error("Feature not found: NONEXISTENT") when id absent from BACKLOG.md', () => {
      const md = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | Alpha | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), md)
      expect(() => mgr.incrementReworks('NONEXISTENT')).toThrow('Feature not found: NONEXISTENT')
    })
  })

  describe('TS-I-20: updateTaskStatus scopes update to featureId', () => {
    it('only F002 T01 updated; F001 T01 unchanged', () => {
      const md = [
        '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | T01 | sdk | task one | sdk_core | - | NOT_STARTED |',
        '| F002 | T01 | sdk | task one | sdk_core | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), md)
      mgr.updateTaskStatus('F002', 'T01', 'VALIDATION', 'COMPLETED')
      const tasks = mgr.loadDevelopmentState()
      const f001t01 = tasks.find(t => t.featureId === 'F001' && t.taskId === 'T01')
      const f002t01 = tasks.find(t => t.featureId === 'F002' && t.taskId === 'T01')
      expect(f001t01?.status).toBe('NOT_STARTED')
      expect(f002t01?.status).toBe('COMPLETED')
      expect(f002t01?.currentPhase).toBe('VALIDATION')
    })
  })

  describe('TS-I-19: loadRecentDecisions returns last N rows from DECISIONS.md', () => {
    it('returns last 3 entries from a file with 5 table rows', () => {
      const md = [
        '# Decisions',
        '',
        '| Timestamp | Feature | Decision | Scores | Rationale |',
        '| --- | --- | --- | --- | --- |',
        '| 2024-01-01 | F001 | PASS | 0.85 | row 1 |',
        '| 2024-01-02 | F001 | RETRY | 0.60 | row 2 |',
        '| 2024-01-03 | F002 | PASS | 0.90 | row 3 |',
        '| 2024-01-04 | F002 | FAIL | 0.40 | row 4 |',
        '| 2024-01-05 | F003 | PASS | 0.80 | row 5 |',
      ].join('\n')
      writeFileSync(join(productDir, 'DECISIONS.md'), md)
      const rows = mgr.loadRecentDecisions(3)
      expect(rows).toHaveLength(3)
      expect(rows[0]).toContain('row 3')
      expect(rows[1]).toContain('row 4')
      expect(rows[2]).toContain('row 5')
    })

    it('returns all rows when file has fewer rows than N', () => {
      const md = [
        '# Decisions',
        '',
        '| Timestamp | Feature | Decision | Scores | Rationale |',
        '| --- | --- | --- | --- | --- |',
        '| 2024-01-01 | F001 | PASS | 0.85 | only row |',
      ].join('\n')
      writeFileSync(join(productDir, 'DECISIONS.md'), md)
      const rows = mgr.loadRecentDecisions(5)
      expect(rows).toHaveLength(1)
    })

    it('returns empty array when DECISIONS.md has no data rows', () => {
      const md = '# Decisions\n\n| Timestamp | Feature | Decision | Scores | Rationale |\n| --- | --- | --- | --- | --- |'
      writeFileSync(join(productDir, 'DECISIONS.md'), md)
      const rows = mgr.loadRecentDecisions(3)
      expect(rows).toEqual([])
    })
  })

  describe('TS-I-SEC-01: writeReworkLog rejects path traversal in domain', () => {
    it('throws Error("Invalid domain: path traversal detected") for domain="../../etc"', () => {
      expect(() => mgr.writeReworkLog('../../etc', 'payload')).toThrow('Invalid domain: path traversal detected')
    })

    it('throws for domain with leading slash', () => {
      expect(() => mgr.writeReworkLog('/etc/passwd', 'payload')).toThrow('Invalid domain: path traversal detected')
    })

    it('accepts valid domain like "sdk_core"', () => {
      expect(() => mgr.writeReworkLog('sdk_core', 'ok')).not.toThrow()
    })
  })

  describe('TS-I-15: writeReworkLog appends on second call', () => {
    it('file contains both rework entries', () => {
      mgr.writeReworkLog('sdk_core', 'first rework content')
      mgr.writeReworkLog('sdk_core', 'second rework content')
      const logPath = join(tmpDir, 'docs', 'specs', 'sdk_core', 'REWORK-LOG.md')
      const content = readFileSync(logPath, 'utf-8')
      expect(content).toContain('first rework content')
      expect(content).toContain('second rework content')
    })
  })

  describe('TS-I-16: Atomic write — file is consistent after save', () => {
    it('file is valid markdown table after updateFeatureStatus', () => {
      const md = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | Alpha | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), md)
      mgr.updateFeatureStatus('F001', 'IN_PROGRESS')
      const content = readFileSync(join(productDir, 'BACKLOG.md'), 'utf-8')
      // Should be a valid table with proper separators
      expect(content).toContain('| --- |')
      expect(content).toContain('IN_PROGRESS')
      // No partial rows
      const lines = content.trim().split('\n').filter(l => l.trim())
      expect(lines.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('TS-I-17: loadDevelopmentState returns empty array for header-only file', () => {
    it('returns []', () => {
      const md = '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |\n| --- | --- | --- | --- | --- | --- | --- |'
      writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), md)
      expect(mgr.loadDevelopmentState()).toEqual([])
    })
  })

  describe('TS-I-18: loadBacklog gracefully handles Score "-" as null', () => {
    it('scoreTL and scoreAdv are null not NaN', () => {
      const md = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | Alpha | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), md)
      const features = mgr.loadBacklog()
      expect(features[0].scoreTL).toBeNull()
      expect(features[0].scoreAdv).toBeNull()
    })
  })

  describe('TS-I-27: writeReworkLog preserves content without semicolons as-is', () => {
    it('single-item reason written without modification', () => {
      mgr.writeReworkLog('sdk_core', 'simple rework reason')
      const logPath = join(tmpDir, 'docs', 'specs', 'sdk_core', 'REWORK-LOG.md')
      const content = readFileSync(logPath, 'utf-8')
      expect(content).toContain('simple rework reason')
    })
  })

  describe('TS-I-28: appendDecision truncates rationale to 200 characters', () => {
    it('rationale longer than 200 chars is truncated with ellipsis in DECISIONS.md', () => {
      const longRationale = 'A'.repeat(300)
      mgr.appendDecision({ featureId: 'F001', decision: 'PASS', rationale: longRationale })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      const dataRow = content.split('\n').find(l => l.includes('PASS') && l.startsWith('|'))!
      const cells = dataRow.split('|').map(c => c.trim())
      const rationaleCell = cells[5]
      expect(rationaleCell.length).toBeLessThanOrEqual(203) // 200 chars + '...'
      expect(rationaleCell.endsWith('...')).toBe(true)
    })
  })

  describe('TS-I-29: appendDecision preserves rationale under 200 characters intact', () => {
    it('short rationale written as-is without truncation', () => {
      const shortRationale = 'Scores pass thresholds, no vulnerabilities.'
      mgr.appendDecision({ featureId: 'F001', decision: 'PASS', rationale: shortRationale })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      expect(content).toContain(shortRationale)
    })
  })

  describe('TS-I-30: refinement file state management', () => {
    it('returns false for existRefinement when REFINEMENT.md does not exist and empty string for loadRefinement', () => {
      expect(mgr.existRefinement()).toBe(false)
      expect(mgr.loadRefinement()).toBe('')
    })

    it('saves and loads REFINEMENT.md content correctly', () => {
      const content = '# Refinement Context\n- Architecture: REST API'
      mgr.saveRefinement(content)
      expect(mgr.existRefinement()).toBe(true)
      expect(mgr.loadRefinement()).toBe(content)
    })
  })
})
