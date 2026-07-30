import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { PhaseDecisionLogger } from '../PhaseDecisionLogger'
import type { IFileStateManager } from '../../../file-state/FileStateManager'
import type { Feature } from '../../../file-state/types'
import * as PhaseFileUtils from '../../utils/PhaseFileUtils'

vi.mock('../../utils/PhaseFileUtils')

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'F001',
    title: 'Test Feature',
    domain: 'sdk_core',
    layer: 'backend',
    priority: 1,
    dependencies: [],
    reworks: 0,
    scoreTL: null,
    scoreAdv: null,
    status: 'IN_PROGRESS',
    ...overrides,
  }
}

function makeFsm(): IFileStateManager {
  return {
    appendDecision: vi.fn(),
    loadBacklog: vi.fn(),
    loadDevelopmentState: vi.fn(),
    loadBootstrapConfig: vi.fn(),
    saveBootstrapConfig: vi.fn(),
    existBootstrapConfig: vi.fn(),
    updateFeatureStatus: vi.fn(),
    incrementReworks: vi.fn(),
    resetReworks: vi.fn(),
    blockDependents: vi.fn(),
    getExecutableFeatures: vi.fn(),
    appendTasks: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateAllFeatureTasks: vi.fn(),
    resetTasksForRetry: vi.fn(),
    getPendingTasks: vi.fn(),
    loadRecentDecisions: vi.fn(),
    writeReworkLog: vi.fn(),
    getNextTask: vi.fn(),
    ensureProductFiles: vi.fn(),
  } as unknown as IFileStateManager
}

describe('PhaseDecisionLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ─── logBootstrap ─────────────────────────────────────────────────────────

  describe('logBootstrap', () => {
    it('does nothing when features list is empty', () => {
      const fsm = makeFsm()
      PhaseDecisionLogger.logBootstrap(fsm, [])
      expect(fsm.appendDecision).not.toHaveBeenCalled()
    })

    it('records total count and per-layer breakdown', () => {
      const fsm = makeFsm()
      const features: Feature[] = [
        makeFeature({ id: 'F001', layer: 'backend' }),
        makeFeature({ id: 'F002', layer: 'frontend' }),
        makeFeature({ id: 'F003', layer: 'backend' }),
      ]

      PhaseDecisionLogger.logBootstrap(fsm, features)

      expect(fsm.appendDecision).toHaveBeenCalledOnce()
      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.featureId).toBeNull()
      expect(call.decision).toContain('3 feature(s)')
      expect(call.rationale).toContain('2 backend')
      expect(call.rationale).toContain('1 frontend')
      expect(call.rationale).toContain('F001')
      expect(call.rationale).toContain('F002')
      expect(call.rationale).toContain('F003')
    })

    it('handles features with no layer (unknown bucket)', () => {
      const fsm = makeFsm()
      PhaseDecisionLogger.logBootstrap(fsm, [makeFeature({ layer: null })])

      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.rationale).toContain('unknown')
    })
  })

  // ─── logPlanning ────────────────────────────────────────────────────────────

  describe('logPlanning', () => {
    it('records spec files and task count', () => {
      vi.mocked(PhaseFileUtils.listSpecFiles).mockReturnValue([
        '001-problem-space.md',
        '003-backend-tactical-design.md',
      ])
      const fsm = makeFsm()
      const feature = makeFeature()

      PhaseDecisionLogger.logPlanning(fsm, feature, '/some/specs/dir', 4)

      expect(PhaseFileUtils.listSpecFiles).toHaveBeenCalledWith('/some/specs/dir')
      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.featureId).toBe('F001')
      expect(call.decision).toContain('sdk_core')
      expect(call.decision).toContain('4 task(s)')
      expect(call.rationale).toContain('001-problem-space.md')
      expect(call.rationale).toContain('003-backend-tactical-design.md')
    })

    it('records "none" when no spec files found', () => {
      vi.mocked(PhaseFileUtils.listSpecFiles).mockReturnValue([])
      const fsm = makeFsm()

      PhaseDecisionLogger.logPlanning(fsm, makeFeature(), '/empty/dir', 0)

      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.rationale).toContain('none')
    })
  })

  // ─── logDevelopmen ────────────────────────────────────────────────────────────

  describe('logDevelopmen', () => {
    it('records TDD status and rationale from readTddOutput', () => {
      vi.mocked(PhaseFileUtils.readTddOutput).mockReturnValue({
        status: 'SUCCESS',
        rationale: 'tests: 5 total, 5 passed, 0 failed, coverage: 0.95. modified: src/a.ts.',
      })
      const fsm = makeFsm()
      const tddPath = '/some/TDD-OUTPUT.json'

      PhaseDecisionLogger.logDevelopmen(fsm, makeFeature(), tddPath)

      expect(PhaseFileUtils.readTddOutput).toHaveBeenCalledWith(tddPath)
      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.decision).toContain('SUCCESS')
      expect(call.decision).toContain('sdk_core')
      expect(call.rationale).toContain('5 total')
    })

    it('records UNKNOWN when TDD output missing', () => {
      vi.mocked(PhaseFileUtils.readTddOutput).mockReturnValue({
        status: 'UNKNOWN',
        rationale: 'TDD-OUTPUT.json not found.',
      })
      const fsm = makeFsm()

      PhaseDecisionLogger.logDevelopmen(fsm, makeFeature(), '/missing/TDD-OUTPUT.json')

      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.decision).toContain('UNKNOWN')
    })
  })

  // ─── logReview ────────────────────────────────────────────────────────────

  describe('logReview', () => {
    it('records verdict, scores and reason', () => {
      const fsm = makeFsm()

      PhaseDecisionLogger.logReview(fsm, makeFeature(), 'PASS', 0.92, 0.88, 'All checks passed.')

      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.featureId).toBe('F001')
      expect(call.decision).toContain('PASS')
      expect(call.decision).toContain('sdk_core')
      expect(call.scores).toEqual({ tl: 0.92, adv: 0.88 })
      expect(call.rationale).toBe('All checks passed.')
    })

    it('records RETRY verdict with scores', () => {
      const fsm = makeFsm()

      PhaseDecisionLogger.logReview(fsm, makeFeature(), 'RETRY', 0.60, 0.55, 'Score below threshold.')

      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.decision).toContain('RETRY')
      expect(call.scores).toEqual({ tl: 0.60, adv: 0.55 })
    })
  })

  // ─── logMemory ────────────────────────────────────────────────────────────

  describe('logMemory', () => {
    it('records documents found in project feature dirs', () => {
      vi.mocked(PhaseFileUtils.listDocFiles).mockImplementation((dir: string) => {
        if (dir.includes('project-a')) return ['/project-a/docs/feature/AUTH.md']
        if (dir.includes('project-b')) return ['/project-b/docs/feature/USERS.md']
        return []
      })
      const fsm = makeFsm()
      const feature = makeFeature()
      const projectPaths = ['/project-a', '/project-b']

      PhaseDecisionLogger.logMemory(fsm, projectPaths)

      expect(PhaseFileUtils.listDocFiles).toHaveBeenCalledWith(join('/project-a', 'docs', 'feature'))
      expect(PhaseFileUtils.listDocFiles).toHaveBeenCalledWith(join('/project-b', 'docs', 'feature'))
      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.featureId).toBeNull()
      expect(call.decision).toBe('Memory: project memory written')
      expect(call.rationale).toContain('AUTH.md')
      expect(call.rationale).toContain('USERS.md')
    })

    it('records "no new files detected" when all feature dirs are empty', () => {
      vi.mocked(PhaseFileUtils.listDocFiles).mockReturnValue([])
      const fsm = makeFsm()

      PhaseDecisionLogger.logMemory(fsm, ['/project-x'])

      const call = (fsm.appendDecision as any).mock.calls[0][0]
      expect(call.featureId).toBeNull()
      expect(call.decision).toBe('Memory: project memory written')
      expect(call.rationale).toContain('no new files detected')
    })
  })
})
