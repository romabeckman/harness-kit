import { Phase } from './types'
import type { PhaseTransition, OnDiskState } from './types'

/**
 * StateMachine: defines the PhaseTransition table and the next() function.
 * - BOOTSTRAP → PHASE_A: always after initialization
 * - PHASE_A → CASCADE_BLOCKED: dependency blocked
 * - PHASE_A → PHASE_B: spec files present
 * - PHASE_B → PHASE_B: tasks remain (loop)
 * - PHASE_B → PHASE_C: all tasks completed
 * - PHASE_C → PHASE_D: PASS/BLOCK/FAIL verdict
 * - PHASE_C → PHASE_B: RETRY verdict
 * - PHASE_D → PHASE_E: always (HALTED decided inside runPhaseE)
 * - PHASE_E → PHASE_A or HALTED (decided inside runPhaseE)
 */
export class StateMachine {
  static readonly transitions: PhaseTransition[] = [
    { from: Phase.BOOTSTRAP,    condition: 'product files initialized',        to: Phase.PHASE_A },
    { from: Phase.PHASE_A,      condition: 'dependency is BLOCKED',            to: Phase.CASCADE_BLOCKED },
    { from: Phase.PHASE_A,      condition: 'spec files present',               to: Phase.PHASE_B },
    { from: Phase.PHASE_B,      condition: 'all tasks COMPLETED + TDD-OUTPUT', to: Phase.PHASE_C },
    { from: Phase.PHASE_B,      condition: 'tasks remain',                     to: Phase.PHASE_B },
    { from: Phase.PHASE_C,      condition: 'PASS/BLOCK/FAIL → feature terminal', to: Phase.PHASE_D },
    { from: Phase.PHASE_C,      condition: 'RETRY → tasks reset',              to: Phase.PHASE_B },
    { from: Phase.PHASE_D,      condition: 'completion check done',            to: Phase.PHASE_E },
    { from: Phase.PHASE_E,      condition: 'memory saved',                     to: Phase.PHASE_F },
    { from: Phase.PHASE_F,      condition: 'features remain',                  to: Phase.PHASE_A },
    { from: Phase.PHASE_F,      condition: 'no features remain',               to: Phase.HALTED },
  ]

  static next(current: Phase, state: OnDiskState): Phase {
    switch (current) {
      case Phase.BOOTSTRAP:
        // After bootstrap: always go to PHASE_A
        return Phase.PHASE_A

      case Phase.PHASE_A: {
        // Check for blocked dependency first
        if (state.activeFeature) {
          const blocked = state.activeFeature.dependencies.some(depId => {
            const dep = state.features.find(f => f.id === depId)
            return dep?.status === 'BLOCKED'
          })
          if (blocked) return Phase.CASCADE_BLOCKED
        }
        // Spec files present → proceed to PHASE_B
        if (state.specFilesPresent) return Phase.PHASE_B
        // Default: stay in PHASE_A (shouldn't happen in normal flow)
        return Phase.PHASE_A
      }

      case Phase.PHASE_B: {
        // All tasks done + TDD-OUTPUT → PHASE_C
        if (state.tddOutputPresent && state.allTasksCompleted) return Phase.PHASE_C
        // Otherwise loop
        return Phase.PHASE_B
      }

      case Phase.PHASE_C: {
        if (!state.activeFeature) return Phase.PHASE_D
        const { status } = state.activeFeature
        // PASS/BLOCK/FAIL → terminal → PHASE_D
        if (state.config?.pendingStatus) {
          return Phase.PHASE_D
        }
        if (status === 'COMPLETED' || status === 'BLOCKED' || status === 'FAILED') {
          return Phase.PHASE_D
        }
        // RETRY (feature still IN_PROGRESS) → PHASE_B
        return Phase.PHASE_B
      }

      case Phase.PHASE_D:
        return Phase.PHASE_E

      case Phase.PHASE_E:
        return Phase.PHASE_F

      case Phase.PHASE_F:
        return Phase.HALTED

      case Phase.CASCADE_BLOCKED:
        return Phase.PHASE_D

      default:
        return Phase.HALTED
    }
  }
}
