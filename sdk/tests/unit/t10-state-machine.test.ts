/*
import { describe, it, expect } from 'vitest'
import { StateMachine } from '../../src/orchestrator/StateMachine'
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

describe('T10 — StateMachine', () => {
  describe('TS-U-07: BOOTSTRAP → PLANNING', () => {
    it('returns PLANNING when files initialized', () => {
      const state = makeState({ productFilesExist: true })
      expect(StateMachine.next(Phase.BOOTSTRAP, state)).toBe(Phase.PLANNING)
    })
  })

  describe('TS-U-08: PLANNING → CASCADE_BLOCKED when dependency BLOCKED', () => {
    it('returns CASCADE_BLOCKED', () => {
      const features = [
        { ...baseFeature, id: 'F001', status: 'BLOCKED' as const },
        { ...baseFeature, id: 'F002', status: 'NOT_STARTED' as const, dependencies: ['F001'] },
      ]
      const state = makeState({ features, activeFeature: features[1] })
      expect(StateMachine.next(Phase.PLANNING, state)).toBe(Phase.CASCADE_BLOCKED)
    })
  })

  describe('TS-U-09: PLANNING → DEVELOPMENT when spec files present', () => {
    it('returns DEVELOPMENT', () => {
      const state = makeState({
        specFilesPresent: true,
        activeFeature: { ...baseFeature, status: 'IN_PROGRESS' },
      })
      expect(StateMachine.next(Phase.PLANNING, state)).toBe(Phase.DEVELOPMENT)
    })
  })

  describe('TS-U-10: DEVELOPMENT → DEVELOPMENT when TDD-OUTPUT absent and tasks remain', () => {
    it('returns DEVELOPMENT (loop continues)', () => {
      const state = makeState({
        tddOutputPresent: false,
        tasks: [{ ...baseTask, status: 'NOT_STARTED' }],
        allTasksCompleted: false,
      })
      expect(StateMachine.next(Phase.DEVELOPMENT, state)).toBe(Phase.DEVELOPMENT)
    })
  })

  describe('TS-U-11: DEVELOPMENT → REVIEW when all tasks COMPLETED', () => {
    it('returns REVIEW', () => {
      const state = makeState({
        tddOutputPresent: true,
        allTasksCompleted: true,
        tasks: [{ ...baseTask, status: 'COMPLETED' }],
      })
      expect(StateMachine.next(Phase.DEVELOPMENT, state)).toBe(Phase.REVIEW)
    })
  })

  describe('TS-U-12: REVIEW → STATE_CHECK on PASS verdict', () => {
    it('returns STATE_CHECK when feature COMPLETED', () => {
      const state = makeState({
        activeFeature: { ...baseFeature, status: 'COMPLETED' },
      })
      expect(StateMachine.next(Phase.REVIEW, state)).toBe(Phase.STATE_CHECK)
    })
  })

  describe('TS-U-13: REVIEW → DEVELOPMENT on RETRY verdict', () => {
    it('returns DEVELOPMENT when feature IN_PROGRESS (retry)', () => {
      const state = makeState({
        activeFeature: { ...baseFeature, status: 'IN_PROGRESS' },
        allTasksCompleted: false,
        tddOutputPresent: false,
      })
      expect(StateMachine.next(Phase.REVIEW, state)).toBe(Phase.DEVELOPMENT)
    })
  })

  describe('TS-U-14: REVIEW → STATE_CHECK on BLOCK verdict', () => {
    it('returns STATE_CHECK when feature BLOCKED', () => {
      const state = makeState({
        activeFeature: { ...baseFeature, status: 'BLOCKED' },
      })
      expect(StateMachine.next(Phase.REVIEW, state)).toBe(Phase.STATE_CHECK)
    })
  })

  describe('TS-U-15: REVIEW → STATE_CHECK on FAIL verdict', () => {
    it('returns STATE_CHECK when feature FAILED', () => {
      const state = makeState({
        activeFeature: { ...baseFeature, status: 'FAILED' },
      })
      expect(StateMachine.next(Phase.REVIEW, state)).toBe(Phase.STATE_CHECK)
    })
  })

  describe('TS-U-16: STATE_CHECK → MEMORY when executable features remain', () => {
    it('returns MEMORY', () => {
      const features = [
        { ...baseFeature, id: 'F001', status: 'COMPLETED' as const },
        { ...baseFeature, id: 'F002', status: 'NOT_STARTED' as const },
      ]
      const state = makeState({ features })
      expect(StateMachine.next(Phase.STATE_CHECK, state)).toBe(Phase.MEMORY)
    })
  })

  describe('TS-U-17: STATE_CHECK → MEMORY when no executable features remain', () => {
    it('returns MEMORY', () => {
      const features = [
        { ...baseFeature, id: 'F001', status: 'COMPLETED' as const },
        { ...baseFeature, id: 'F002', status: 'FAILED' as const },
      ]
      const state = makeState({ features })
      expect(StateMachine.next(Phase.STATE_CHECK, state)).toBe(Phase.MEMORY)
    })
  })

  describe('TS-U-17b: MEMORY → TRANSITION', () => {
    it('returns TRANSITION', () => {
      const state = makeState({})
      expect(StateMachine.next(Phase.MEMORY, state)).toBe(Phase.TRANSITION)
    })
  })

  describe('TS-U-17c: TRANSITION → HALTED', () => {
    it('returns HALTED', () => {
      const state = makeState({})
      expect(StateMachine.next(Phase.TRANSITION, state)).toBe(Phase.HALTED)
    })
  })

  describe('StateMachine.transitions list', () => {
    it('exports PhaseTransition array', () => {
      expect(Array.isArray(StateMachine.transitions)).toBe(true)
      expect(StateMachine.transitions.length).toBeGreaterThan(0)
      expect(StateMachine.transitions[0]).toHaveProperty('from')
      expect(StateMachine.transitions[0]).toHaveProperty('condition')
      expect(StateMachine.transitions[0]).toHaveProperty('to')
    })
  })
})
*/
// Empty test to satisfy vitest
import { test } from 'vitest'
test('StateMachine is obsolete, replaced by PhaseHandlers', () => { })

