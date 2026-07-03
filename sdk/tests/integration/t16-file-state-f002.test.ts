/**
 * T16 — FileStateManager F002 test suite
 * Tests for all 7 new/updated methods introduced in F002.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FileStateManager } from '../../src/file-state/FileStateManager'

let tmpDir: string
let productDir: string
let mgr: FileStateManager

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'harness-f002-test-'))
  productDir = join(tmpDir, 'docs', 'product')
  mkdirSync(productDir, { recursive: true })
  mgr = new FileStateManager({ productDir, workingDir: tmpDir })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function writeBacklog(rows: string[]): void {
  const header = [
    '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  writeFileSync(join(productDir, 'BACKLOG.md'), [...header, ...rows].join('\n'))
}

function writeDevState(rows: string[]): void {
  const header = [
    '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ]
  writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), [...header, ...rows].join('\n'))
}

function writeDecisions(rows: string[] = []): void {
  const header = [
    '# Autonomous Decision Audit Trail',
    '',
    '| Timestamp | Feature | Decision | Scores | Rationale |',
    '| --- | --- | --- | --- | --- |',
  ]
  writeFileSync(join(productDir, 'DECISIONS.md'), [...header, ...rows].join('\n'))
}

// ─── 1. appendDecision(DecisionEntry) ─────────────────────────────────────────

describe('F002 — appendDecision(DecisionEntry)', () => {
  describe('3.1 Row appended with featureId and all fields', () => {
    it('appends a table row with correct columns', () => {
      writeDecisions()
      mgr.appendDecision({
        featureId: 'F001',
        decision: 'Proceed to Phase B',
        scores: { tl: 0.85, adv: 0.90 },
        rationale: 'Both scores above threshold',
      })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      expect(content).toContain('F001')
      expect(content).toContain('Proceed to Phase B')
      // 0.90 is rendered as 0.9 in JS — match both TL and Adv prefix
      expect(content).toContain('TL:0.85, Adv:0.9')
      expect(content).toContain('Both scores above threshold')
    })

    it('new row is appended after existing rows', () => {
      writeDecisions(['| 2024-01-01 | F000 | prior decision | - | - |'])
      mgr.appendDecision({ featureId: 'F001', decision: 'New decision' })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      expect(content).toContain('prior decision')
      expect(content).toContain('New decision')
      const priorIdx = content.indexOf('prior decision')
      const newIdx = content.indexOf('New decision')
      expect(newIdx).toBeGreaterThan(priorIdx)
    })
  })

  describe('3.2 null featureId renders as GLOBAL', () => {
    it('Feature column shows GLOBAL', () => {
      writeDecisions()
      mgr.appendDecision({ featureId: null, decision: 'Halting — no executable features remain' })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      expect(content).toContain('GLOBAL')
      expect(content).toContain('Halting — no executable features remain')
    })
  })

  describe('3.3 Scores formatted as TL:{tl}, Adv:{adv}', () => {
    it('scores column contains TL:0.6, Adv:0.55 (JS drops trailing zero)', () => {
      writeDecisions()
      mgr.appendDecision({
        featureId: 'F002',
        decision: 'Rework triggered',
        scores: { tl: 0.60, adv: 0.55 },
      })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      // JS renders 0.60 as 0.6
      expect(content).toContain('TL:0.6, Adv:0.55')
    })
  })

  describe('3.4 Without scores — scores column shows -', () => {
    it('scores and rationale columns show dash', () => {
      writeDecisions()
      mgr.appendDecision({ featureId: 'F002', decision: 'Feature blocked — dependency cycle' })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      const rows = content.split('\n').filter(l => l.includes('Feature blocked'))
      expect(rows).toHaveLength(1)
      const cells = rows[0].split('|')
      // cells[4] is Scores column, cells[5] is Rationale
      expect(cells[4].trim()).toBe('-')
      expect(cells[5].trim()).toBe('-')
    })
  })

  describe('3.5 Without rationale — rationale column shows -', () => {
    it('rationale column is dash, scores populated', () => {
      writeDecisions()
      mgr.appendDecision({
        featureId: 'F001',
        decision: 'Completed',
        scores: { tl: 0.9, adv: 0.85 },
      })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      const rows = content.split('\n').filter(l => l.includes('Completed') && !l.includes('---'))
      expect(rows).toHaveLength(1)
      const cells = rows[0].split('|')
      expect(cells[5].trim()).toBe('-') // rationale
      expect(cells[4].trim()).toContain('TL:0.9, Adv:0.85')
    })
  })

  describe('3.6 Multiple calls — each produces a separate row', () => {
    it('three calls produce three data rows', () => {
      writeDecisions()
      mgr.appendDecision({ featureId: 'F001', decision: 'Decision one' })
      mgr.appendDecision({ featureId: 'F001', decision: 'Decision two' })
      mgr.appendDecision({ featureId: 'F001', decision: 'Decision three' })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      const dataRows = content.split('\n').filter(l => {
        if (!l.startsWith('|')) return false
        const cells = l.split('|').slice(1, -1)
        if (cells.length < 2) return false
        const first = cells[0].trim()
        return first !== '---' && first.toLowerCase() !== 'timestamp'
      })
      expect(dataRows).toHaveLength(3)
    })
  })

  describe('Row format — markdown table row', () => {
    it('row starts and ends with pipe and contains 5 columns', () => {
      writeDecisions()
      mgr.appendDecision({ featureId: 'F001', decision: 'Test row format' })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      const rows = content.split('\n').filter(l => l.includes('Test row format'))
      expect(rows).toHaveLength(1)
      expect(rows[0].startsWith('|')).toBe(true)
      expect(rows[0].endsWith('|')).toBe(true)
      const cells = rows[0].split('|').slice(1, -1)
      expect(cells).toHaveLength(5)
    })
  })
})

// ─── 2. updateFeatureStatus ────────────────────────────────────────────────────

describe('F002 — updateFeatureStatus', () => {
  describe('1.1 Status and scores written to correct row', () => {
    it('updates status, scoreTL, scoreAdv for matching row', () => {
      writeBacklog([
        '| F001 | Feature One | core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
        '| F002 | Feature Two | core | backend | 2 | - | 0 | - | - | NOT_STARTED |',
      ])
      mgr.updateFeatureStatus('F001', 'COMPLETED', { tl: 0.85, adv: 0.90 })
      const features = mgr.loadBacklog()
      const f001 = features.find(f => f.id === 'F001')!
      expect(f001.status).toBe('COMPLETED')
      expect(f001.scoreTL).toBe(0.85)
      expect(f001.scoreAdv).toBe(0.90)
      // F002 unchanged
      const f002 = features.find(f => f.id === 'F002')!
      expect(f002.status).toBe('NOT_STARTED')
    })
  })

  describe('1.2 Status updated without scores — score columns preserved', () => {
    it('existing scores remain unchanged when scores arg omitted', () => {
      writeBacklog(['| F001 | Feature One | core | backend | 1 | - | 0 | 0.75 | 0.80 | IN_PROGRESS |'])
      mgr.updateFeatureStatus('F001', 'FAILED')
      const features = mgr.loadBacklog()
      const f001 = features.find(f => f.id === 'F001')!
      expect(f001.status).toBe('FAILED')
      expect(f001.scoreTL).toBe(0.75)
      expect(f001.scoreAdv).toBe(0.80)
    })
  })

  describe('1.3 Not found — throws with featureId in message', () => {
    it('throws Error containing F999 when not in backlog', () => {
      writeBacklog(['| F001 | Feature One | core | backend | 1 | - | 0 | - | - | NOT_STARTED |'])
      expect(() => mgr.updateFeatureStatus('F999', 'COMPLETED')).toThrow('F999')
      // File unchanged
      const features = mgr.loadBacklog()
      expect(features).toHaveLength(1)
      expect(features[0].status).toBe('NOT_STARTED')
    })
  })

  describe('1.4 Idempotency — second call produces identical file', () => {
    it('file content after second call is byte-for-byte equal to after first call', () => {
      writeBacklog(['| F001 | Feature One | core | backend | 1 | - | 0 | - | - | NOT_STARTED |'])
      mgr.updateFeatureStatus('F001', 'COMPLETED', { tl: 0.9, adv: 0.8 })
      const after1 = readFileSync(join(productDir, 'BACKLOG.md'), 'utf-8')
      mgr.updateFeatureStatus('F001', 'COMPLETED', { tl: 0.9, adv: 0.8 })
      const after2 = readFileSync(join(productDir, 'BACKLOG.md'), 'utf-8')
      expect(after2).toBe(after1)
    })
  })
})

// ─── 3. incrementReworks ──────────────────────────────────────────────────────

describe('F002 — incrementReworks', () => {
  describe('4.1 Reworks incremented from 0 to 1', () => {
    it('reworks is 1 after one call', () => {
      writeBacklog([
        '| F001 | Feature One | core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
        '| F002 | Feature Two | core | backend | 2 | - | 0 | - | - | NOT_STARTED |',
      ])
      mgr.incrementReworks('F001')
      const features = mgr.loadBacklog()
      expect(features.find(f => f.id === 'F001')!.reworks).toBe(1)
      expect(features.find(f => f.id === 'F002')!.reworks).toBe(0)
    })
  })

  describe('4.2 Multiple increments — calling N times → Reworks = N', () => {
    it('three calls produce reworks = 3', () => {
      writeBacklog(['| F001 | Feature One | core | backend | 1 | - | 0 | - | - | NOT_STARTED |'])
      mgr.incrementReworks('F001')
      mgr.incrementReworks('F001')
      mgr.incrementReworks('F001')
      const features = mgr.loadBacklog()
      expect(features[0].reworks).toBe(3)
    })
  })

  describe('4.3 Starts at non-zero — increments correctly', () => {
    it('reworks 2 → 3 after one call', () => {
      writeBacklog(['| F001 | Feature One | core | backend | 1 | - | 2 | - | - | NOT_STARTED |'])
      mgr.incrementReworks('F001')
      expect(mgr.loadBacklog()[0].reworks).toBe(3)
    })
  })

  describe('4.4 Not found — throws with featureId in message', () => {
    it('throws Error containing F999', () => {
      writeBacklog(['| F001 | Feature One | core | backend | 1 | - | 0 | - | - | NOT_STARTED |'])
      expect(() => mgr.incrementReworks('F999')).toThrow('F999')
    })
  })

  describe('4.5 Non-numeric Reworks cell — treated as 0', () => {
    it('dash reworks cell treated as 0, becomes 1 after increment', () => {
      writeBacklog(['| F001 | Feature One | core | backend | 1 | - | - | - | - | NOT_STARTED |'])
      mgr.incrementReworks('F001')
      expect(mgr.loadBacklog()[0].reworks).toBe(1)
    })
  })
})

// ─── 4. resetTasksForRetry ────────────────────────────────────────────────────

describe('F002 — resetTasksForRetry', () => {
  describe('5.1 All tasks for feature set to IMPLEMENTATION/NOT_STARTED', () => {
    it('all F001 tasks reset, F002 task unchanged', () => {
      writeDevState([
        '| F001 | T01 | sdk | task one | core | VALIDATION | COMPLETED |',
        '| F001 | T02 | sdk | task two | core | VALIDATION | IN_PROGRESS |',
        '| F001 | T03 | sdk | task three | core | - | NOT_STARTED |',
        '| F002 | T01 | sdk | f002 task | core | IMPLEMENTATION | IN_PROGRESS |',
      ])
      mgr.resetTasksForRetry('F001')
      const tasks = mgr.loadDevelopmentState()
      const f001tasks = tasks.filter(t => t.featureId === 'F001')
      for (const t of f001tasks) {
        expect(t.currentPhase).toBe('IMPLEMENTATION')
        expect(t.status).toBe('NOT_STARTED')
      }
      const f002task = tasks.find(t => t.featureId === 'F002')!
      expect(f002task.status).toBe('IN_PROGRESS')
      expect(f002task.currentPhase).toBe('IMPLEMENTATION')
    })
  })

  describe('5.2 No tasks for feature — no throw, file unchanged', () => {
    it('returns without throwing when no tasks for featureId', () => {
      writeDevState([
        '| F001 | T01 | sdk | task one | core | IMPLEMENTATION | NOT_STARTED |',
      ])
      const before = readFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), 'utf-8')
      expect(() => mgr.resetTasksForRetry('F999')).not.toThrow()
      const after = readFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), 'utf-8')
      expect(after).toBe(before)
    })
  })

  describe('5.3 Idempotency — call twice produces same result', () => {
    it('file after second call is identical to after first call', () => {
      writeDevState([
        '| F001 | T01 | sdk | task one | core | VALIDATION | COMPLETED |',
        '| F001 | T02 | sdk | task two | core | VALIDATION | COMPLETED |',
      ])
      mgr.resetTasksForRetry('F001')
      const after1 = readFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), 'utf-8')
      mgr.resetTasksForRetry('F001')
      const after2 = readFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), 'utf-8')
      expect(after2).toBe(after1)
    })
  })

  describe('5.4 Mixed statuses — ALL reset unconditionally', () => {
    it('COMPLETED, FAILED, BLOCKED, IN_PROGRESS all reset', () => {
      writeDevState([
        '| F001 | T01 | sdk | t1 | core | VALIDATION | COMPLETED |',
        '| F001 | T02 | sdk | t2 | core | VALIDATION | FAILED |',
        '| F001 | T03 | sdk | t3 | core | - | BLOCKED |',
        '| F001 | T04 | sdk | t4 | core | IMPLEMENTATION | IN_PROGRESS |',
      ])
      mgr.resetTasksForRetry('F001')
      const tasks = mgr.loadDevelopmentState()
      for (const t of tasks) {
        expect(t.currentPhase).toBe('IMPLEMENTATION')
        expect(t.status).toBe('NOT_STARTED')
      }
    })
  })
})

// ─── 5. getExecutableFeatures ──────────────────────────────────────────────────

describe('F002 — getExecutableFeatures', () => {
  describe('6.1 All dependencies COMPLETED — feature included', () => {
    it('returns [F002] when F001 is COMPLETED', () => {
      writeBacklog([
        '| F001 | Feature One | core | backend | 1 | - | 0 | - | - | COMPLETED |',
        '| F002 | Feature Two | core | backend | 2 | F001 | 0 | - | - | NOT_STARTED |',
      ])
      const result = mgr.getExecutableFeatures()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('F002')
    })
  })

  describe('6.2 One dependency BLOCKED — feature excluded', () => {
    it('returns [] when dependency is BLOCKED', () => {
      writeBacklog([
        '| F001 | Feature One | core | backend | 1 | - | 0 | - | - | BLOCKED |',
        '| F002 | Feature Two | core | backend | 2 | F001 | 0 | - | - | NOT_STARTED |',
      ])
      expect(mgr.getExecutableFeatures()).toEqual([])
    })
  })

  describe('6.3 One dependency IN_PROGRESS — feature excluded', () => {
    it('returns [] when dependency is IN_PROGRESS', () => {
      writeBacklog([
        '| F001 | Feature One | core | backend | 1 | - | 0 | - | - | IN_PROGRESS |',
        '| F002 | Feature Two | core | backend | 2 | F001 | 0 | - | - | NOT_STARTED |',
      ])
      expect(mgr.getExecutableFeatures()).toEqual([])
    })
  })

  describe('6.4 No dependencies — feature included when NOT_STARTED', () => {
    it('returns [F001] when dependencies empty and status NOT_STARTED', () => {
      writeBacklog(['| F001 | Feature One | core | backend | 1 | - | 0 | - | - | NOT_STARTED |'])
      const result = mgr.getExecutableFeatures()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('F001')
    })
  })

  describe('6.5 Feature is IN_PROGRESS — excluded even if all deps COMPLETED', () => {
    it('returns [] when feature status is IN_PROGRESS', () => {
      writeBacklog([
        '| F001 | Feature One | core | backend | 1 | - | 0 | - | - | COMPLETED |',
        '| F002 | Feature Two | core | backend | 2 | F001 | 0 | - | - | IN_PROGRESS |',
      ])
      expect(mgr.getExecutableFeatures()).toEqual([])
    })
  })

  describe('6.6 Empty backlog — returns empty array', () => {
    it('returns [] without throwing', () => {
      writeBacklog([])
      expect(mgr.getExecutableFeatures()).toEqual([])
    })
  })

  describe('6.7 All features terminal — returns empty array', () => {
    it('returns [] when all features are COMPLETED/BLOCKED/FAILED', () => {
      writeBacklog([
        '| F001 | Feature One | core | backend | 1 | - | 0 | - | - | COMPLETED |',
        '| F002 | Feature Two | core | backend | 2 | - | 0 | - | - | BLOCKED |',
        '| F003 | Feature Three | core | backend | 3 | - | 0 | - | - | FAILED |',
      ])
      expect(mgr.getExecutableFeatures()).toEqual([])
    })
  })

  describe('6.8 Multiple executable features — all returned', () => {
    it('returns both F001 and F002 in table order', () => {
      writeBacklog([
        '| F001 | Feature One | core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
        '| F002 | Feature Two | core | backend | 2 | - | 0 | - | - | NOT_STARTED |',
      ])
      const result = mgr.getExecutableFeatures()
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('F001')
      expect(result[1].id).toBe('F002')
    })
  })

  describe('6.9 Dependency referenced but not in backlog — feature excluded', () => {
    it('returns [] when dependency F001 does not exist in backlog', () => {
      writeBacklog(['| F002 | Feature Two | core | backend | 2 | F001 | 0 | - | - | NOT_STARTED |'])
      expect(mgr.getExecutableFeatures()).toEqual([])
    })
  })
})

// ─── 6. getNextTask ────────────────────────────────────────────────────────────

describe('F002 — getNextTask', () => {
  describe('7.1 Multiple NOT_STARTED tasks — returns first in table order', () => {
    it('returns T01 when T01 and T02 are both NOT_STARTED', () => {
      writeDevState([
        '| F001 | T01 | sdk | task one | core | - | NOT_STARTED |',
        '| F001 | T02 | sdk | task two | core | - | NOT_STARTED |',
      ])
      const task = mgr.getNextTask('F001')
      expect(task).not.toBeNull()
      expect(task!.taskId).toBe('T01')
    })
  })

  describe('7.2 All tasks COMPLETED — returns null', () => {
    it('returns null when all F001 tasks are COMPLETED', () => {
      writeDevState([
        '| F001 | T01 | sdk | task one | core | VALIDATION | COMPLETED |',
        '| F001 | T02 | sdk | task two | core | VALIDATION | COMPLETED |',
      ])
      expect(mgr.getNextTask('F001')).toBeNull()
    })
  })

  describe('7.3 No tasks for featureId — returns null', () => {
    it('returns null without throwing when no F001 tasks exist', () => {
      writeDevState(['| F002 | T01 | sdk | f002 task | core | - | NOT_STARTED |'])
      expect(mgr.getNextTask('F001')).toBeNull()
    })
  })

  describe('7.4 Mixed statuses — skips COMPLETED/IN_PROGRESS, returns first NOT_STARTED', () => {
    it('skips T01 (COMPLETED) and T02 (IN_PROGRESS), returns T03', () => {
      writeDevState([
        '| F001 | T01 | sdk | task one | core | VALIDATION | COMPLETED |',
        '| F001 | T02 | sdk | task two | core | IMPLEMENTATION | IN_PROGRESS |',
        '| F001 | T03 | sdk | task three | core | - | NOT_STARTED |',
      ])
      const task = mgr.getNextTask('F001')
      expect(task).not.toBeNull()
      expect(task!.taskId).toBe('T03')
    })
  })

  describe('7.5 Table order preserved — not alphabetical', () => {
    it('returns T10 when T10 appears before T02 in the file', () => {
      writeDevState([
        '| F001 | T10 | sdk | task ten | core | - | NOT_STARTED |',
        '| F001 | T02 | sdk | task two | core | - | NOT_STARTED |',
      ])
      const task = mgr.getNextTask('F001')
      expect(task!.taskId).toBe('T10')
    })
  })

  describe('7.6 Tasks for other features ignored', () => {
    it('returns null for F001 when only F002 has NOT_STARTED tasks', () => {
      writeDevState([
        '| F002 | T01 | sdk | f002 task | core | - | NOT_STARTED |',
        '| F001 | T01 | sdk | f001 task | core | VALIDATION | COMPLETED |',
      ])
      expect(mgr.getNextTask('F001')).toBeNull()
    })
  })
})

// ─── 8. Bold-markdown ID stripping ────────────────────────────────────────────

describe('F002 REWORK — bold-markdown ID stripping', () => {
  describe('8.1 updateFeatureStatus with bold ID in BACKLOG.md', () => {
    it('succeeds when BACKLOG.md stores ID as **F002** but caller passes plain F002', () => {
      writeBacklog([
        '| **F001** | Feature One | core | backend | 1 | - | 0 | - | - | COMPLETED |',
        '| **F002** | Feature Two | core | backend | 2 | F001 | 0 | - | - | NOT_STARTED |',
      ])
      expect(() => mgr.updateFeatureStatus('F002', 'IN_PROGRESS', { tl: 0.75, adv: 0.80 })).not.toThrow()
      const features = mgr.loadBacklog()
      const f002 = features.find(f => f.id === 'F002')!
      expect(f002.status).toBe('IN_PROGRESS')
      expect(f002.scoreTL).toBe(0.75)
    })
  })

  describe('8.2 incrementReworks with bold ID in BACKLOG.md', () => {
    it('increments reworks when BACKLOG.md stores ID as **F002**', () => {
      writeBacklog([
        '| **F002** | Feature Two | core | backend | 2 | - | 0 | - | - | NOT_STARTED |',
      ])
      expect(() => mgr.incrementReworks('F002')).not.toThrow()
      const features = mgr.loadBacklog()
      expect(features.find(f => f.id === 'F002')!.reworks).toBe(1)
    })
  })

  describe('8.3 getExecutableFeatures with bold IDs in BACKLOG.md', () => {
    it('resolves dependency match when IDs stored as **F001** in ID col and plain F001 in deps col', () => {
      writeBacklog([
        '| **F001** | Feature One | core | backend | 1 | - | 0 | - | - | COMPLETED |',
        '| **F002** | Feature Two | core | backend | 2 | F001 | 0 | - | - | NOT_STARTED |',
      ])
      const result = mgr.getExecutableFeatures()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('F002')
    })
  })

  describe('8.4 getNextTask with bold featureId in DEVELOPMENT-STATE.md', () => {
    it('returns task when DEVELOPMENT-STATE.md stores featureId as **F001** but caller passes plain F001', () => {
      writeDevState([
        '| **F001** | T01 | sdk | task one | core | - | NOT_STARTED |',
        '| **F001** | T02 | sdk | task two | core | - | NOT_STARTED |',
      ])
      const task = mgr.getNextTask('F001')
      expect(task).not.toBeNull()
      expect(task!.taskId).toBe('T01')
    })
  })
})

// ─── 9. Pipe injection in appendDecision ──────────────────────────────────────

describe('F002 REWORK — pipe injection in appendDecision', () => {
  describe('9.1 Pipe in decision field escaped — row has exactly 5 cells', () => {
    it('row has exactly 5 pipe-delimited cells when decision contains |', () => {
      writeDecisions()
      mgr.appendDecision({
        featureId: 'F001',
        decision: 'Score above | threshold',
        rationale: 'TL: 0.78, score above | threshold',
      })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      const rows = content.split('\n').filter(l => l.includes('threshold') && l.startsWith('|'))
      expect(rows).toHaveLength(1)
      const cells = rows[0].split('|').slice(1, -1)
      expect(cells).toHaveLength(5)
    })
  })

  describe('9.2 Pipe in rationale field escaped — row has exactly 5 cells', () => {
    it('row has exactly 5 cells when rationale contains |', () => {
      writeDecisions()
      mgr.appendDecision({
        featureId: 'F002',
        decision: 'Proceed',
        scores: { tl: 0.8, adv: 0.9 },
        rationale: 'condition A | condition B met',
      })
      const content = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      const rows = content.split('\n').filter(l => l.includes('condition A') && l.startsWith('|'))
      expect(rows).toHaveLength(1)
      const cells = rows[0].split('|').slice(1, -1)
      expect(cells).toHaveLength(5)
    })
  })
})

// ─── 10. existsSync guard in updateAllFeatureTasks ────────────────────────────

describe('F002 REWORK — existsSync guard in resetTasksForRetry', () => {
  describe('10.1 resetTasksForRetry no-op when DEVELOPMENT-STATE.md absent', () => {
    it('does not throw when DEVELOPMENT-STATE.md does not exist', () => {
      // productDir exists but DEVELOPMENT-STATE.md was never created
      expect(() => mgr.resetTasksForRetry('F001')).not.toThrow()
    })
  })
})
