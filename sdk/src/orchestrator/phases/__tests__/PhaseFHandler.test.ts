import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TransitionHandler } from '../TransitionHandler'
import { Complexity, Phase } from '../../types'
import type { Reviewontext } from '../AbstractPhaseHandler'
import type { IFileStateManager } from '../../../file-state/FileStateManager'
import type { Feature, BootstrapConfig } from '../../../file-state/types'

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'F001',
    title: 'Feature 1',
    domain: 'feat1',
    layer: 'backend',
    priority: 1,
    dependencies: [],
    reworks: 2,
    scoreTL: 0.9,
    scoreAdv: 0.9,
    status: 'IN_PROGRESS',
    ...overrides,
  }
}

function makeConfig(pendingStatus?: string): BootstrapConfig {
  return {
    projectPaths: [],
    scoreThresholdTL: 0.70,
    scoreThresholdAdv: 0.70,
    completionCriteria: { maxReworks: 2 },
    cycleCounter: { completedCycles: 0 },
    steeringRules: { user: [] },
  }
}

function makeFsm(
  features: Feature[],
  pendingStatus?: string,
  blockDependentsImpl?: (id: string, fs: Feature[]) => string[]
): IFileStateManager {
  const loadBacklog = vi.fn().mockReturnValue(features)
  const blockDependents = vi.fn().mockImplementation(blockDependentsImpl ?? (() => []))

  return {
    loadBacklog,
    loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig(pendingStatus)),
    updateFeatureStatus: vi.fn(),
    updateAllFeatureTasks: vi.fn(),
    blockDependents,
    saveBootstrapConfig: vi.fn(),
    appendDecision: vi.fn(),
    getExecutableFeatures: vi.fn(),
    incrementReworks: vi.fn(),
    resetReworks: vi.fn(),
    loadDevelopmentState: vi.fn().mockReturnValue([]),
    appendTasks: vi.fn(),
    updateTaskStatus: vi.fn(),
    resetTasksForRetry: vi.fn(),
    getPendingTasks: vi.fn().mockReturnValue([]),
    getNextTask: vi.fn().mockReturnValue(null),
    writeReworkLog: vi.fn(),
    loadRecentDecisions: vi.fn().mockReturnValue([]),
    existBootstrapConfig: vi.fn().mockReturnValue(true),
    ensureProductFiles: vi.fn(),
  } as unknown as IFileStateManager
}

function makeContext(fsm: IFileStateManager, activeFeature: Feature | null = makeFeature()): Reviewontext {
  return {
    config: { scope: 'test', score: 0.7, reworks: 2, projectPaths: [], complexity: Complexity.AUTO },
    workingDir: '/tmp/test',
    fsm,
    invokeAgent: vi.fn(),
    getActiveFeature: vi.fn().mockReturnValue(activeFeature),
    checkSpecFilesPresent: vi.fn().mockReturnValue(true),
    extractTasksFromTacticalDesign: vi.fn().mockReturnValue([]),
  }
}

describe('TransitionHandler', () => {
  let handler: TransitionHandler

  beforeEach(() => {
    handler = new TransitionHandler()
  })

  it('delegates to next handler when phase is not TRANSITION', async () => {
    const fsm = makeFsm([makeFeature()], 'COMPLETED')
    const ctx = makeContext(fsm)
    const result = await handler.handle(Phase.PLANNING, ctx)
    expect(result).toBeNull()
  })

  it('throws when no active feature and no retryable features exist', async () => {
    const fsm = makeFsm([makeFeature({ status: 'COMPLETED' })], 'COMPLETED')
    const ctx = makeContext(fsm, null)
    await expect(handler.handle(Phase.TRANSITION, ctx)).rejects.toThrow('Illegal state')
  })

  describe('COMPLETED — no cascade', () => {
    it('does not call blockDependents and advances to next NOT_STARTED feature', async () => {
      const f1 = makeFeature({ id: 'F001', status: 'IN_PROGRESS', scoreTL: 0.9, scoreAdv: 0.9 })
      const f2 = makeFeature({ id: 'F002', status: 'NOT_STARTED', dependencies: [] })
      const fsm = makeFsm([f1, f2], 'COMPLETED')

      // After update F1 is COMPLETED, F2 still NOT_STARTED
      const updatedFeatures = [
        { ...f1, status: 'COMPLETED' as const },
        f2,
      ]
      fsm.loadBacklog = vi.fn()
        .mockReturnValueOnce([f1, f2])   // initial load in handle()
        .mockReturnValueOnce(updatedFeatures) // reload after cascade

      const ctx = makeContext(fsm, f1)
      ctx.developerSession = {
        featureId: 'F001',
        agent: 'harness-kit:developer-backend',
        session: { id: 'DEV-123' },
        phase: Phase.DEVELOPMENT,
      }
      const result = await handler.handle(Phase.TRANSITION, ctx)

      expect(fsm.blockDependents).not.toHaveBeenCalled()
      expect(result).toBe(Phase.PLANNING)
      expect(ctx.developerSession).toBeUndefined()
      expect(fsm.saveBootstrapConfig).toHaveBeenCalledWith(
        expect.objectContaining({ activeFeatureId: 'F002' })
      )
    })
  })

  describe('BLOCKED — cascade to direct dependents', () => {
    it('calls blockDependents and logs cascade decision', async () => {
      const f1 = makeFeature({ id: 'F001', status: 'BLOCKED', scoreTL: 0.4, scoreAdv: 0.2 })
      const f2 = makeFeature({ id: 'F002', status: 'NOT_STARTED', dependencies: ['F001'] })
      const fsm = makeFsm([f1, f2], 'BLOCKED', () => ['F002'])

      // After blockDependents, F2 is BLOCKED
      const afterCascade = [
        { ...f1, status: 'BLOCKED' as const },
        { ...f2, status: 'BLOCKED' as const },
      ]
      fsm.loadBacklog = vi.fn()
        .mockReturnValueOnce([f1, f2])    // initial
        .mockReturnValueOnce(afterCascade) // find next

      const ctx = makeContext(fsm, f1)
      const result = await handler.handle(Phase.TRANSITION, ctx)

      expect(fsm.blockDependents).toHaveBeenCalledWith('F001', [f1, f2])
      expect(fsm.appendDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.stringContaining('F002'),
        })
      )
      // No NOT_STARTED left → DEPLOY
      expect(result).toBe(Phase.MEMORY)
    })

    it('returns PLANNING when unrelated features remain NOT_STARTED after cascade', async () => {
      const f1 = makeFeature({ id: 'F001', status: 'BLOCKED' })
      const f2 = makeFeature({ id: 'F002', status: 'NOT_STARTED', dependencies: ['F001'] })
      const f3 = makeFeature({ id: 'F003', status: 'NOT_STARTED', dependencies: [] })
      const fsm = makeFsm([f1, f2, f3], 'BLOCKED', () => ['F002'])

      const afterCascade = [
        { ...f1, status: 'BLOCKED' as const },
        { ...f2, status: 'BLOCKED' as const },
        f3,
      ]
      fsm.loadBacklog = vi.fn()
        .mockReturnValueOnce([f1, f2, f3])
        .mockReturnValueOnce(afterCascade)

      const ctx = makeContext(fsm, f1)
      const result = await handler.handle(Phase.TRANSITION, ctx)

      expect(result).toBe(Phase.PLANNING)
      expect(fsm.saveBootstrapConfig).toHaveBeenCalledWith(
        expect.objectContaining({ activeFeatureId: 'F003' })
      )
    })

    it('does not log cascade decision when no dependents exist', async () => {
      const f1 = makeFeature({ id: 'F001', status: 'BLOCKED' })
      const fsm = makeFsm([f1], 'BLOCKED', () => [])

      fsm.loadBacklog = vi.fn()
        .mockReturnValueOnce([f1])
        .mockReturnValueOnce([f1])
        .mockReturnValueOnce([{ ...f1, status: 'BLOCKED' as const }])

      const ctx = makeContext(fsm, f1)
      await handler.handle(Phase.TRANSITION, ctx)

      // appendDecision is called for onFeatureTransition but NOT for cascade
      const cascadeCall = (fsm.appendDecision as ReturnType<typeof vi.fn>).mock.calls
        .find(c => String(c[0]?.decision).includes('cascade'))
      expect(cascadeCall).toBeUndefined()
    })
  })

  describe('FAILED — no cascade, dependents liberated', () => {
    it('does not call blockDependents and picks dependent as next feature', async () => {
      const f1 = makeFeature({ id: 'F001', status: 'FAILED', scoreTL: 0.5, scoreAdv: 0.5 })
      const f2 = makeFeature({ id: 'F002', status: 'NOT_STARTED', dependencies: ['F001'] })
      const fsm = makeFsm([f1, f2], 'FAILED')

      const afterFail = [
        { ...f1, status: 'FAILED' as const },
        f2, // still NOT_STARTED — liberated
      ]
      fsm.loadBacklog = vi.fn()
        .mockReturnValueOnce([f1, f2])
        .mockReturnValueOnce(afterFail)

      const ctx = makeContext(fsm, f1)
      const result = await handler.handle(Phase.TRANSITION, ctx)

      expect(fsm.blockDependents).not.toHaveBeenCalled()
      expect(result).toBe(Phase.PLANNING)
      expect(fsm.saveBootstrapConfig).toHaveBeenCalledWith(
        expect.objectContaining({ activeFeatureId: 'F002' })
      )
    })
  })

  describe('HALTED — no NOT_STARTED features remain and all BLOCKED exhausted', () => {
    it('clears activeFeatureId and returns HALTED', async () => {
      const f1 = makeFeature({ id: 'F001', status: 'IN_PROGRESS', reworks: 2 })
      const fsm = makeFsm([f1], 'COMPLETED')

      const completedF1 = { ...f1, status: 'COMPLETED' as const }
      fsm.loadBacklog = vi.fn()
        .mockReturnValueOnce([f1])           // initial load
        .mockReturnValueOnce([completedF1])  // reload after cascade
        .mockReturnValueOnce([completedF1])  // for saveBootstrapConfig reload

      const ctx = makeContext(fsm, f1)
      const result = await handler.handle(Phase.TRANSITION, ctx)

      expect(result).toBe(Phase.MEMORY)
      const saveCalls = (fsm.saveBootstrapConfig as any).mock.calls
      const lastCallArg = saveCalls[saveCalls.length - 1][0]
      expect(lastCallArg.activeFeatureId).toBeUndefined()
    })
  })

  describe('unblock-retry (reentry) — BLOCKED features with reworks < maxReworks when activeFeature is null', () => {
    it('resets all BLOCKED features (root + dependents) and returns DEVELOPMENT', async () => {
      // maxReworks=2 in makeConfig; features have reworks=0 (below max)
      const f1 = makeFeature({ id: 'F001', status: 'BLOCKED', reworks: 0 })
      const f2 = makeFeature({ id: 'F002', status: 'BLOCKED', reworks: 0, dependencies: ['F001'] })
      const fsm = makeFsm([f1, f2], 'BLOCKED')

      const ctx = makeContext(fsm, null)
      const result = await handler.handle(Phase.TRANSITION, ctx)

      expect(result).toBe(Phase.DEVELOPMENT)
      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F001', 'NOT_STARTED')
      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F002', 'NOT_STARTED')
      expect(fsm.resetReworks).toHaveBeenCalledWith('F001')
      expect(fsm.resetReworks).toHaveBeenCalledWith('F002')
      expect(fsm.appendDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: expect.stringContaining('unblock-retry (reentry)'),
        })
      )
      expect(fsm.saveBootstrapConfig).toHaveBeenCalledWith(
        expect.objectContaining({ activeFeatureId: 'F001' })
      )
    })

    /*
    it('throws Illegal state when all BLOCKED features have reworks >= maxReworks', async () => {
      // maxReworks=2; feature has reworks=2 (exhausted)
      const f1 = makeFeature({ id: 'F001', status: 'BLOCKED', reworks: 2 })
      const fsm = makeFsm([f1], 'BLOCKED')

      const ctx = makeContext(fsm, null)
      
      await expect(handler.handle(Phase.TRANSITION, ctx)).rejects.toThrow('Illegal state')
      expect(fsm.resetReworks).not.toHaveBeenCalled()
    })

    it('retries only features with reworks < maxReworks, skips exhausted ones', async () => {
      // F001 exhausted (reworks=2), F002 eligible (reworks=1)
      const f1 = makeFeature({ id: 'F001', status: 'BLOCKED', reworks: 2 })
      const f2 = makeFeature({ id: 'F002', status: 'BLOCKED', reworks: 1, dependencies: [] })
      const fsm = makeFsm([f1, f2], 'BLOCKED')

      const ctx = makeContext(fsm, null)
      const result = await handler.handle(Phase.TRANSITION, ctx)

      expect(result).toBe(Phase.DEVELOPMENT)
      expect(fsm.updateFeatureStatus).not.toHaveBeenCalledWith('F001', 'NOT_STARTED')
      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F002', 'NOT_STARTED')
      expect(fsm.resetReworks).not.toHaveBeenCalledWith('F001')
      expect(fsm.resetReworks).toHaveBeenCalledWith('F002')
      expect(fsm.saveBootstrapConfig).toHaveBeenCalledWith(
        expect.objectContaining({ activeFeatureId: 'F002' })
      )
    })
    */
  })
})
