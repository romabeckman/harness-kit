import { describe, it, expect } from 'vitest'
import { ReentryResolver } from '../../src/orchestrator/ReentryResolver'
import { Phase } from '../../src/orchestrator/types'
import type { OnDiskState } from '../../src/orchestrator/types'
import type { Feature, Task, BootstrapConfig } from '../../src/file-state/types'

const defaultConfig: BootstrapConfig = {
  scoreThresholdTL: 0.70,
  scoreThresholdAdv: 0.70,
  completionCriteria: { maxReworks: 2 },
  cycleCounter: { completedCycles: 0 },
}

const baseFeature: Feature = {
  id: 'F001', title: 'SDK Core', domain: 'sdk_core',
  priority: 1, dependencies: [], reworks: 0,
  scoreTL: null, scoreAdv: null, status: 'NOT_STARTED',
}

const baseTask: Task = {
  featureId: 'F001', taskId: 'T01', project: 'sdk',
  description: 'task', domain: 'sdk_core',
  currentPhase: '-', status: 'NOT_STARTED',
}

function makeState(overrides: Partial<OnDiskState>): OnDiskState {
  return {
    productFilesExist: true,
    features: [baseFeature],
    tasks: [],
    config: defaultConfig,
    activeFeature: baseFeature,
    specFilesPresent: false,
    tddOutputPresent: false,
    allTasksCompleted: false,
    ...overrides,
  }
}

describe('T09 — ReentryResolver', () => {
  describe('TS-U-37: Persisted currentPhase in config takes precedence', () => {
    it('returns the persisted phase', () => {
      const state = makeState({
        config: { ...defaultConfig, currentPhase: Phase.MEMORY },
      })
      expect(ReentryResolver.resolve(state)).toBe(Phase.MEMORY)
    })
  })

  describe('TS-U-38: Fresh state resolves to BOOTSTRAP', () => {
    it('returns BOOTSTRAP when productFilesExist=false', () => {
      const state = makeState({ productFilesExist: false })
      expect(ReentryResolver.resolve(state)).toBe(Phase.BOOTSTRAP)
    })
  })

  describe('TS-U-39: All files exist, feature NOT_STARTED, spec absent → PLANNING', () => {
    it('returns PLANNING', () => {
      const state = makeState({
        activeFeature: { ...baseFeature, status: 'NOT_STARTED' },
        specFilesPresent: false,
        tddOutputPresent: false,
      })
      expect(ReentryResolver.resolve(state)).toBe(Phase.PLANNING)
    })
  })

  describe('TS-U-40: Spec files present → DEVELOPMENT', () => {
    it('returns DEVELOPMENT when spec present, tasks NOT_STARTED, TDD-OUTPUT absent', () => {
      const state = makeState({
        specFilesPresent: true,
        tddOutputPresent: false,
        tasks: [{ ...baseTask, status: 'NOT_STARTED' }],
        allTasksCompleted: false,
        activeFeature: { ...baseFeature, status: 'IN_PROGRESS' },
      })
      expect(ReentryResolver.resolve(state)).toBe(Phase.DEVELOPMENT)
    })
  })

  describe('TS-U-41: TDD-OUTPUT present and all tasks COMPLETED → REVIEW', () => {
    it('returns REVIEW', () => {
      const state = makeState({
        tddOutputPresent: true,
        allTasksCompleted: true,
        tasks: [{ ...baseTask, status: 'COMPLETED' }],
        activeFeature: { ...baseFeature, status: 'IN_PROGRESS' },
      })
      expect(ReentryResolver.resolve(state)).toBe(Phase.REVIEW)
    })
  })

  describe('TS-U-42: Feature COMPLETED, more NOT_STARTED features -> TRANSITION', () => {
    it('returns TRANSITION', () => {
      const features = [
        { ...baseFeature, id: 'F001', status: 'COMPLETED' as const },
        { ...baseFeature, id: 'F002', status: 'NOT_STARTED' as const },
      ]
      const state = makeState({
        features,
        activeFeature: features[0],
        allTasksCompleted: true,
      })
      expect(ReentryResolver.resolve(state)).toBe(Phase.TRANSITION)
    })
  })

  describe('TS-U-43: All features terminal -> TRANSITION (final loop pass)', () => {
    it('returns TRANSITION when no NOT_STARTED feature', () => {
      const features = [
        { ...baseFeature, id: 'F001', status: 'COMPLETED' as const },
        { ...baseFeature, id: 'F002', status: 'FAILED' as const },
      ]
      const state = makeState({ features, activeFeature: features[0] })
      expect(ReentryResolver.resolve(state)).toBe(Phase.TRANSITION)
    })
  })

  describe('TS-U-44: Dependency BLOCKED → CASCADE_BLOCKED', () => {
    it('returns CASCADE_BLOCKED when dependency is BLOCKED', () => {
      const features = [
        { ...baseFeature, id: 'F001', status: 'BLOCKED' as const },
        { ...baseFeature, id: 'F002', status: 'NOT_STARTED' as const, dependencies: ['F001'] },
      ]
      const state = makeState({
        features,
        activeFeature: features[1],
      })
      expect(ReentryResolver.resolve(state)).toBe(Phase.CASCADE_BLOCKED)
    })
  })

  describe('TS-U-45: Table is ordered — first matching condition wins', () => {
    it('specFilesPresent AND allTasksCompleted returns REVIEW (tdd-output condition first)', () => {
      // Both DEVELOPMENT condition (spec present) and REVIEW condition (tdd-output+completed) match.
      // REVIEW condition must come before DEVELOPMENT in table → returns REVIEW
      const state = makeState({
        specFilesPresent: true,
        tddOutputPresent: true,
        allTasksCompleted: true,
        tasks: [{ ...baseTask, status: 'COMPLETED' }],
        activeFeature: { ...baseFeature, status: 'IN_PROGRESS' },
      })
      expect(ReentryResolver.resolve(state)).toBe(Phase.REVIEW)
    })
  })
})
