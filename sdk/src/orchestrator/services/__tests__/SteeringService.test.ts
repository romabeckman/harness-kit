import { describe, it, expect, vi } from 'vitest'
import { SteeringService } from '../SteeringService'
import type { IFileStateManager } from '../../../file-state/FileStateManager'
import type { OrchestratorState } from '../../types'
import { Phase } from '../../types'
import type { Feature, BootstrapConfig, Task } from '../../../file-state/types'

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'F001',
    title: 'Feature One',
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

function makeConfig(overrides: Partial<BootstrapConfig> = {}): BootstrapConfig {
  return {
    projectPaths: [],
    scoreThresholdTL: 0.85,
    scoreThresholdAdv: 0.85,
    completionCriteria: { maxReworks: 3 },
    cycleCounter: { completedCycles: 0 },
    steeringRules: { user: [] },
    ...overrides,
  }
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    featureId: 'F001',
    taskId: 'T01',
    project: 'sdk',
    description: 'Do something',
    domain: 'sdk_core',
    currentPhase: '-',
    status: 'NOT_STARTED',
    ...overrides,
  }
}

function makeFsm(config: BootstrapConfig, features: Feature[] = [], tasks: Task[] = []): IFileStateManager {
  return {
    loadBootstrapConfig: vi.fn().mockReturnValue(config),
    saveBootstrapConfig: vi.fn(),
    appendDecision: vi.fn(),
    loadBacklog: vi.fn().mockReturnValue(features),
    loadDevelopmentState: vi.fn().mockReturnValue(tasks),
    updateTaskStatus: vi.fn(),
    updateFeatureStatus: vi.fn(),
  } as unknown as IFileStateManager
}

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    currentPhase: Phase.DEVELOPMENT,
    activeFeatureId: null,
    completedCycles: 0,
    ...overrides,
  }
}

describe('SteeringService', () => {
  describe('applySteeringActions — add_rule', () => {
    it('pushes the rule into steeringRules.user and saves config', () => {
      const config = makeConfig()
      const fsm = makeFsm(config)
      const service = new SteeringService(fsm, makeState())

      service.applySteeringActions([{ type: 'add_rule', rule: 'Never mutate shared state' }])

      expect(config.steeringRules!.user).toContain('Never mutate shared state')
      expect(fsm.saveBootstrapConfig).toHaveBeenCalledWith(expect.objectContaining({
        steeringRules: expect.objectContaining({
          user: expect.arrayContaining(['Never mutate shared state']),
        }),
      }))
    })

    it('appends a decision entry describing the added rule', () => {
      const fsm = makeFsm(makeConfig())
      const service = new SteeringService(fsm, makeState())

      service.applySteeringActions([{ type: 'add_rule', rule: 'Always write tests first' }])

      expect(fsm.appendDecision).toHaveBeenCalledWith(expect.objectContaining({
        featureId: null,
        decision: expect.stringContaining('Always write tests first'),
      }))
    })

    it('initializes steeringRules when config has none', () => {
      const config = makeConfig({ steeringRules: undefined })
      const fsm = makeFsm(config)
      const service = new SteeringService(fsm, makeState())

      service.applySteeringActions([{ type: 'add_rule', rule: 'New rule' }])

      expect(config.steeringRules).toBeDefined()
      expect(config.steeringRules!.user).toContain('New rule')
    })

    it('initializes steeringRules.user array when only steeringRules.user is missing', () => {
      const config = makeConfig({ steeringRules: { bootstrap: ['existing'] } })
      const fsm = makeFsm(config)
      const service = new SteeringService(fsm, makeState())

      service.applySteeringActions([{ type: 'add_rule', rule: 'Another rule' }])

      expect(config.steeringRules!.user).toContain('Another rule')
    })
  })

  describe('applySteeringActions — rollback', () => {
    it('updates state.currentPhase and config.currentPhase to the target phase', () => {
      const config = makeConfig()
      const fsm = makeFsm(config)
      const state = makeState({ currentPhase: Phase.REVIEW })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'rollback', targetPhase: Phase.DEVELOPMENT }])

      expect(state.currentPhase).toBe(Phase.DEVELOPMENT)
      expect(config.currentPhase).toBe(Phase.DEVELOPMENT)
    })

    it('appends a decision entry referencing the target phase', () => {
      const fsm = makeFsm(makeConfig())
      const service = new SteeringService(fsm, makeState())

      service.applySteeringActions([{ type: 'rollback', targetPhase: Phase.PLANNING }])

      expect(fsm.appendDecision).toHaveBeenCalledWith(expect.objectContaining({
        decision: expect.stringContaining(Phase.PLANNING),
      }))
    })

    it('resets all tasks of the active feature to NOT_STARTED when rolling back to DEVELOPMENT', () => {
      const feature = makeFeature({ status: 'IN_PROGRESS' })
      const tasks: Task[] = [
        makeTask({ taskId: 'T01', featureId: 'F001', status: 'COMPLETED' }),
        makeTask({ taskId: 'T02', featureId: 'F001', status: 'IN_PROGRESS' }),
        makeTask({ taskId: 'T03', featureId: 'F002', status: 'COMPLETED' }),
      ]
      const fsm = makeFsm(makeConfig(), [feature], tasks)
      const state = makeState({ activeFeatureId: 'F001' })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'rollback', targetPhase: Phase.DEVELOPMENT }])

      expect(fsm.updateTaskStatus).toHaveBeenCalledWith('F001', 'T01', '-', 'NOT_STARTED')
      expect(fsm.updateTaskStatus).toHaveBeenCalledWith('F001', 'T02', '-', 'NOT_STARTED')
      expect(fsm.updateTaskStatus).not.toHaveBeenCalledWith('F002', expect.anything(), expect.anything(), expect.anything())
    })

    it('resets tasks when rolling back to PLANNING', () => {
      const feature = makeFeature()
      const tasks: Task[] = [makeTask({ taskId: 'T01', status: 'IN_PROGRESS' })]
      const fsm = makeFsm(makeConfig(), [feature], tasks)
      const state = makeState({ activeFeatureId: 'F001' })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'rollback', targetPhase: Phase.PLANNING }])

      expect(fsm.updateTaskStatus).toHaveBeenCalledWith('F001', 'T01', '-', 'NOT_STARTED')
    })

    it('does NOT reset tasks when rolling back to REVIEW (only PLANNING/B reset tasks)', () => {
      const feature = makeFeature()
      const tasks: Task[] = [makeTask({ taskId: 'T01' })]
      const fsm = makeFsm(makeConfig(), [feature], tasks)
      const state = makeState({ activeFeatureId: 'F001' })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'rollback', targetPhase: Phase.REVIEW }])

      expect(fsm.updateTaskStatus).not.toHaveBeenCalled()
    })

    it('skips task reset when there is no active feature', () => {
      const fsm = makeFsm(makeConfig(), [])
      const state = makeState({ activeFeatureId: null })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'rollback', targetPhase: Phase.DEVELOPMENT }])

      expect(fsm.updateTaskStatus).not.toHaveBeenCalled()
    })
  })

  describe('applySteeringActions — override_score', () => {
    it('updates scores for the active feature and saves a decision', () => {
      const feature = makeFeature({ id: 'F001', scoreTL: 0.5, scoreAdv: 0.6 })
      const fsm = makeFsm(makeConfig(), [feature])
      const state = makeState({ activeFeatureId: 'F001' })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'override_score', tl: 0.9, adv: 0.95 }])

      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith(
        'F001',
        feature.status,
        { tl: 0.9, adv: 0.95 }
      )
      expect(fsm.appendDecision).toHaveBeenCalledWith(expect.objectContaining({
        featureId: 'F001',
        decision: expect.stringContaining('0.9'),
      }))
    })

    it('falls back to existing feature score when tl override is absent', () => {
      const feature = makeFeature({ scoreTL: 0.7, scoreAdv: 0.8 })
      const fsm = makeFsm(makeConfig(), [feature])
      const state = makeState({ activeFeatureId: 'F001' })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'override_score', adv: 0.99 }])

      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith(
        'F001',
        feature.status,
        { tl: 0.7, adv: 0.99 }
      )
    })

    it('falls back to 100 when both override and existing score are absent', () => {
      const feature = makeFeature({ scoreTL: null, scoreAdv: null })
      const fsm = makeFsm(makeConfig(), [feature])
      const state = makeState({ activeFeatureId: 'F001' })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'override_score' }])

      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith(
        'F001',
        feature.status,
        { tl: 100, adv: 100 }
      )
    })

    it('does nothing when no active feature can be resolved', () => {
      const fsm = makeFsm(makeConfig(), [])
      const state = makeState({ activeFeatureId: null })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'override_score', tl: 0.9, adv: 0.9 }])

      expect(fsm.updateFeatureStatus).not.toHaveBeenCalled()
    })
  })

  describe('getActiveFeature resolution', () => {
    it('resolves by activeFeatureId when set in state', () => {
      const f1 = makeFeature({ id: 'F001', status: 'IN_PROGRESS' })
      const f2 = makeFeature({ id: 'F002', status: 'NOT_STARTED' })
      const fsm = makeFsm(makeConfig(), [f1, f2])
      const state = makeState({ activeFeatureId: 'F002' })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'override_score', tl: 1, adv: 1 }])

      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F002', expect.anything(), expect.anything())
    })

    it('falls back to first NOT_STARTED or IN_PROGRESS feature when activeFeatureId is null', () => {
      const f1 = makeFeature({ id: 'F001', status: 'COMPLETED' })
      const f2 = makeFeature({ id: 'F002', status: 'NOT_STARTED' })
      const fsm = makeFsm(makeConfig(), [f1, f2])
      const state = makeState({ activeFeatureId: null })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'override_score', tl: 1, adv: 1 }])

      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F002', expect.anything(), expect.anything())
    })

    it('falls back to first IN_PROGRESS feature when no NOT_STARTED features exist', () => {
      const f1 = makeFeature({ id: 'F001', status: 'COMPLETED' })
      const f2 = makeFeature({ id: 'F002', status: 'IN_PROGRESS' })
      const fsm = makeFsm(makeConfig(), [f1, f2])
      const state = makeState({ activeFeatureId: null })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([{ type: 'override_score', tl: 1, adv: 1 }])

      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F002', expect.anything(), expect.anything())
    })
  })

  describe('applySteeringActions — empty and mixed', () => {
    it('does nothing when actions array is empty', () => {
      const fsm = makeFsm(makeConfig())
      const service = new SteeringService(fsm, makeState())

      service.applySteeringActions([])

      expect(fsm.saveBootstrapConfig).toHaveBeenCalledTimes(1)
      expect(fsm.appendDecision).not.toHaveBeenCalled()
      expect(fsm.updateFeatureStatus).not.toHaveBeenCalled()
    })

    it('processes multiple mixed actions in order', () => {
      const feature = makeFeature()
      const tasks: Task[] = [makeTask()]
      const fsm = makeFsm(makeConfig(), [feature], tasks)
      const state = makeState({ activeFeatureId: 'F001' })
      const service = new SteeringService(fsm, state)

      service.applySteeringActions([
        { type: 'add_rule', rule: 'Rule one' },
        { type: 'override_score', tl: 0.9, adv: 0.9 },
      ])

      expect(fsm.appendDecision).toHaveBeenCalledTimes(2)
      expect(fsm.updateFeatureStatus).toHaveBeenCalledTimes(1)
    })
  })
})
