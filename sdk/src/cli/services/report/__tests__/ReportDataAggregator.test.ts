import { describe, it, expect, vi } from 'vitest'
import { ReportDataAggregator } from '../ReportDataAggregator'
import type { Feature, Task, BootstrapConfig, FeatureStatus, TaskStatus } from '../../../../file-state/types'
import type { IFileStateManager } from '../../../../file-state/FileStateManager'
import type { TokenLedger, TokenReport } from '../../../../telemetry/TokenLedger'

describe('ReportDataAggregator - Unit Tests', () => {
  const createMockFSM = (override: Partial<IFileStateManager> = {}): IFileStateManager => ({
    saveScope: vi.fn(),
    loadScope: vi.fn().mockReturnValue(''),
    existScope: vi.fn().mockReturnValue(false),
    saveRefinement: vi.fn(),
    loadRefinement: vi.fn().mockReturnValue(''),
    existRefinement: vi.fn().mockReturnValue(false),
    ensureProductFiles: vi.fn(),
    loadBootstrapConfig: vi.fn().mockReturnValue(null),
    saveBootstrapConfig: vi.fn(),
    existBootstrapConfig: vi.fn().mockReturnValue(false),
    loadBacklog: vi.fn().mockReturnValue([]),
    updateFeatureStatus: vi.fn(),
    incrementReworks: vi.fn(),
    resetReworks: vi.fn(),
    blockDependents: vi.fn().mockReturnValue([]),
    getExecutableFeatures: vi.fn().mockReturnValue([]),
    loadDevelopmentState: vi.fn().mockReturnValue([]),
    appendTasks: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateAllFeatureTasks: vi.fn(),
    resetTasksForRetry: vi.fn(),
    getPendingTasks: vi.fn().mockReturnValue([]),
    appendDecision: vi.fn(),
    loadRecentDecisions: vi.fn().mockReturnValue([]),
    writeReworkLog: vi.fn(),
    getNextTask: vi.fn().mockReturnValue(null),
    ...override
  } as unknown as IFileStateManager)

  const createMockLedger = (): TokenLedger => ({
    record: vi.fn(),
    report: vi.fn().mockReturnValue({
      entries: [],
      totals: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0 },
      bySkill: {}
    }),
    printReport: vi.fn()
  } as unknown as TokenLedger)

  const dummyFeature = (id: string, status: FeatureStatus, scoreTL: number | null = null, scoreAdv: number | null = null): Feature => ({
    id, title: 'Title ' + id, domain: 'domain', priority: 1, dependencies: [], reworks: 0, scoreTL, scoreAdv, status
  })

  const dummyTask = (featureId: string, taskId: string, status: TaskStatus): Task => ({
    featureId, taskId, project: 'proj', description: 'desc', domain: 'domain', currentPhase: 'IMPLEMENTATION', status
  })

  describe('aggregateBacklogSummary', () => {
    it('Should compute correct status distribution when backlog has features in all statuses', () => {
      const fsm = createMockFSM({
        loadBacklog: vi.fn().mockReturnValue([
          dummyFeature('F1', 'NOT_STARTED'),
          dummyFeature('F2', 'NOT_STARTED'),
          dummyFeature('F3', 'IN_PROGRESS'),
          dummyFeature('F4', 'COMPLETED'),
          dummyFeature('F5', 'BLOCKED'),
          dummyFeature('F6', 'FAILED')
        ])
      })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.backlogSummary.total).toBe(6)
      expect(report.backlogSummary.byStatus).toEqual({
        NOT_STARTED: 2, IN_PROGRESS: 1, COMPLETED: 1, BLOCKED: 1, FAILED: 1
      })
    })

    it('Should return zero counts when backlog is empty', () => {
      const fsm = createMockFSM({ loadBacklog: vi.fn().mockReturnValue([]) })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.backlogSummary.total).toBe(0)
      expect(report.backlogSummary.byStatus).toEqual({
        NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, BLOCKED: 0, FAILED: 0
      })
      expect(report.backlogSummary.avgScoreTL).toBeNull()
      expect(report.backlogSummary.avgScoreAdv).toBeNull()
    })

    it('Should compute average scores excluding features with null scores', () => {
      const fsm = createMockFSM({
        loadBacklog: vi.fn().mockReturnValue([
          dummyFeature('F1', 'COMPLETED', 0.8, 0.9),
          dummyFeature('F2', 'COMPLETED', null, 0.7),
          dummyFeature('F3', 'COMPLETED', 0.6, null)
        ])
      })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.backlogSummary.avgScoreTL).toBeCloseTo(0.7)
      expect(report.backlogSummary.avgScoreAdv).toBeCloseTo(0.8)
    })

    it('Should return null averages when all scores are null', () => {
      const fsm = createMockFSM({
        loadBacklog: vi.fn().mockReturnValue([
          dummyFeature('F1', 'NOT_STARTED', null, null)
        ])
      })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.backlogSummary.avgScoreTL).toBeNull()
      expect(report.backlogSummary.avgScoreAdv).toBeNull()
    })
  })

  describe('aggregateTaskSummary', () => {
    it('Should compute correct task status distribution when tasks exist in multiple statuses', () => {
      const fsm = createMockFSM({
        loadDevelopmentState: vi.fn().mockReturnValue([
          dummyTask('F1', 'T1', 'NOT_STARTED'),
          dummyTask('F1', 'T2', 'NOT_STARTED'),
          dummyTask('F1', 'T3', 'NOT_STARTED'),
          dummyTask('F1', 'T4', 'IN_PROGRESS'),
          dummyTask('F1', 'T5', 'IN_PROGRESS'),
          dummyTask('F1', 'T6', 'COMPLETED')
        ])
      })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.taskSummary.total).toBe(6)
      expect(report.taskSummary.byStatus).toEqual({
        NOT_STARTED: 3, IN_PROGRESS: 2, COMPLETED: 1, BLOCKED: 0, FAILED: 0
      })
    })

    it('Should return zero counts when no tasks exist', () => {
      const fsm = createMockFSM({ loadDevelopmentState: vi.fn().mockReturnValue([]) })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.taskSummary.total).toBe(0)
      expect(report.taskSummary.byFeature).toEqual({})
    })

    it('Should compute per-feature progress correctly when tasks belong to multiple features', () => {
      const fsm = createMockFSM({
        loadDevelopmentState: vi.fn().mockReturnValue([
          dummyTask('F1', 'T1', 'COMPLETED'),
          dummyTask('F1', 'T2', 'NOT_STARTED'),
          dummyTask('F2', 'T1', 'COMPLETED'),
          dummyTask('F2', 'T2', 'COMPLETED'),
          dummyTask('F2', 'T3', 'COMPLETED')
        ])
      })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.taskSummary.byFeature['F1'].totalTasks).toBe(2)
      expect(report.taskSummary.byFeature['F1'].completedTasks).toBe(1)
      expect(report.taskSummary.byFeature['F2'].totalTasks).toBe(3)
      expect(report.taskSummary.byFeature['F2'].completedTasks).toBe(3)
    })

    it('Should include feature metadata in FeatureProgress when feature exists in backlog', () => {
      const fsm = createMockFSM({
        loadBacklog: vi.fn().mockReturnValue([dummyFeature('F1', 'IN_PROGRESS')]),
        loadDevelopmentState: vi.fn().mockReturnValue([dummyTask('F1', 'T1', 'NOT_STARTED')])
      })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.taskSummary.byFeature['F1'].title).toBe('Title F1')
      expect(report.taskSummary.byFeature['F1'].status).toBe('IN_PROGRESS')
    })

    it('Should handle tasks referencing features not in backlog gracefully', () => {
      const fsm = createMockFSM({
        loadBacklog: vi.fn().mockReturnValue([]),
        loadDevelopmentState: vi.fn().mockReturnValue([dummyTask('F999', 'T1', 'NOT_STARTED')])
      })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.taskSummary.byFeature['F999'].title).toBe('')
      expect(report.taskSummary.byFeature['F999'].status).toBe('NOT_STARTED')
    })
  })

  describe('aggregateConfigSnapshot', () => {
    it('Should project all BootstrapConfig fields into ConfigSnapshot', () => {
      const config: BootstrapConfig = {
        projectPaths: ['./api'],
        currentPhase: 'PLANNING',
        scoreThresholdTL: 0.8,
        scoreThresholdAdv: 0.7,
        completionCriteria: { maxReworks: 3 },
        cycleCounter: { completedCycles: 5 }
      }
      const fsm = createMockFSM({ loadBootstrapConfig: vi.fn().mockReturnValue(config) })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.configSnapshot.projectPaths).toEqual(['./api'])
      expect(report.configSnapshot.currentPhase).toBe('PLANNING')
      expect(report.configSnapshot.scoreThresholdTL).toBe(0.8)
      expect(report.configSnapshot.scoreThresholdAdv).toBe(0.7)
      expect(report.configSnapshot.maxReworks).toBe(3)
      expect(report.configSnapshot.completedCycles).toBe(5)
    })

    it('Should use defaults when BootstrapConfig has missing optional fields', () => {
      const config = {
        scoreThresholdTL: 0.8,
        scoreThresholdAdv: 0.7,
        completionCriteria: { maxReworks: 3 },
        cycleCounter: { completedCycles: 5 }
      }
      const fsm = createMockFSM({ loadBootstrapConfig: vi.fn().mockReturnValue(config) })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.configSnapshot.projectPaths).toEqual([])
      expect(report.configSnapshot.currentPhase).toBe('BOOTSTRAP')
    })
  })

  describe('aggregateDecisionSummary', () => {
    it('Should return correct total count and recent entries', () => {
      const fsm = createMockFSM({
        loadRecentDecisions: vi.fn().mockReturnValue(['1', '2', '3', '4', '5', '6', '7'])
      })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.decisionSummary.totalDecisions).toBe(7)
      expect(report.decisionSummary.recentDecisions).toEqual(['3', '4', '5', '6', '7'])
    })

    it('Should return zero total and empty array when no decisions exist', () => {
      const fsm = createMockFSM({ loadRecentDecisions: vi.fn().mockReturnValue([]) })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      const report = aggregator.aggregate()
      expect(report.decisionSummary.totalDecisions).toBe(0)
      expect(report.decisionSummary.recentDecisions).toEqual([])
    })
  })

  describe('aggregate (ProductReport)', () => {
    it('Should produce a complete ProductReport when all product files exist', () => {
      const fsm = createMockFSM({
        loadBacklog: vi.fn().mockReturnValue([dummyFeature('F1', 'NOT_STARTED')]),
        loadDevelopmentState: vi.fn().mockReturnValue([dummyTask('F1', 'T1', 'NOT_STARTED')]),
        loadBootstrapConfig: vi.fn().mockReturnValue({
          scoreThresholdTL: 0.8, scoreThresholdAdv: 0.8,
          completionCriteria: { maxReworks: 3 }, cycleCounter: { completedCycles: 1 }
        }),
        loadRecentDecisions: vi.fn().mockReturnValue(['decision 1'])
      })
      const ledger = createMockLedger()
      const aggregator = new ReportDataAggregator(fsm, ledger)
      const report = aggregator.aggregate()
      expect(report.backlogSummary.total).toBe(1)
      expect(report.taskSummary.total).toBe(1)
      expect(report.configSnapshot.scoreThresholdTL).toBe(0.8)
      expect(report.decisionSummary.totalDecisions).toBe(1)
      expect(report.tokenReport).toBeDefined()
    })

    it('Should produce a ProductReport with empty summaries when product files do not exist', () => {
      const fsm = createMockFSM({
        loadBacklog: vi.fn().mockImplementation(() => { throw new Error('Not found') }),
        loadDevelopmentState: vi.fn().mockImplementation(() => { throw new Error('Not found') }),
        loadBootstrapConfig: vi.fn().mockImplementation(() => { throw new Error('Not found') }),
        loadRecentDecisions: vi.fn().mockImplementation(() => { throw new Error('Not found') })
      })
      const ledger = createMockLedger()
      const aggregator = new ReportDataAggregator(fsm, ledger)
      const report = aggregator.aggregate()
      expect(report.backlogSummary.total).toBe(0)
      expect(report.taskSummary.total).toBe(0)
      expect(report.configSnapshot.projectPaths).toEqual([])
      expect(report.decisionSummary.totalDecisions).toBe(0)
    })

    it('Should carry no state between consecutive aggregate() calls', () => {
      let run = 1
      const fsm = createMockFSM({
        loadBacklog: vi.fn().mockImplementation(() => {
          if (run === 1) return [dummyFeature('F1', 'NOT_STARTED')]
          return [dummyFeature('F1', 'NOT_STARTED'), dummyFeature('F2', 'NOT_STARTED')]
        })
      })
      const aggregator = new ReportDataAggregator(fsm, createMockLedger())
      
      const report1 = aggregator.aggregate()
      expect(report1.backlogSummary.total).toBe(1)
      
      run = 2
      const report2 = aggregator.aggregate()
      expect(report2.backlogSummary.total).toBe(2)
    })
  })
})
