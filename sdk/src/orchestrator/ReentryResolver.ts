import { Phase } from './types'
import type { OnDiskState } from './types'

/**
 * Encodes the State Transition Table as ordered predicates.
 * resolve() scans in order — first matching condition wins.
 *
 * State Transition Table (ordered):
 * 1. No product files → BOOTSTRAP
 * 2. Active feature dependency is BLOCKED → CASCADE_BLOCKED
 * 3. Valid TDD-OUTPUT present AND all tasks COMPLETED → REVIEW
 * 4. Ready spec files without a valid handoff → DEVELOPMENT
 * 5. Active feature in terminal status (COMPLETED/BLOCKED/FAILED) → TRANSITION
 * 6. No active feature or feature NOT_STARTED with no specs → PLANNING
 * 7. Fallback → BOOTSTRAP
 */
export class ReentryResolver {
  static resolve(state: OnDiskState): Phase {
    // 0. Respect saved phases except stale startup markers for populated backlogs.
    if (state.config?.currentPhase) {
      const persistedPhase = state.config.currentPhase as Phase
      const backlogAlreadyPopulated = state.productFilesExist && state.features.length > 0
      const staleInitialPhase = backlogAlreadyPopulated &&
        (persistedPhase === Phase.BOOTSTRAP || persistedPhase === Phase.REFINEMENT)
      if (Object.values(Phase).includes(persistedPhase) && persistedPhase !== Phase.HALTED) {
        // A persisted REVIEW marker is only trustworthy when the completion
        // evidence is still present and valid on disk.
        if (!staleInitialPhase && (persistedPhase !== Phase.REVIEW || (state.tddOutputPresent && state.allTasksCompleted))) {
          return persistedPhase
        }
      }
    }

    // 1. No product files → BOOTSTRAP
    if (!state.productFilesExist) {
      return Phase.BOOTSTRAP
    }

    // 2. Active feature's dependency is BLOCKED → CASCADE_BLOCKED
    if (state.activeFeature) {
      const blocked = state.activeFeature.dependencies.some(depId => {
        const dep = state.features.find(f => f.id === depId)
        return dep?.status === 'BLOCKED'
      })
      if (blocked) return Phase.CASCADE_BLOCKED
    }

    // 3. A valid TDD handoff AND all tasks COMPLETED → REVIEW
    if (state.tddOutputPresent && state.allTasksCompleted) {
      return Phase.REVIEW
    }

    // 4. Ready specs without a valid completed handoff → DEVELOPMENT
    if (state.specFilesPresent && (!state.allTasksCompleted || !state.tddOutputPresent)) {
      return Phase.DEVELOPMENT
    }

    // 5. Active feature in terminal status → TRANSITION
    if (state.activeFeature) {
      const terminal: Array<typeof state.activeFeature.status> = ['COMPLETED', 'BLOCKED', 'FAILED']
      if (terminal.includes(state.activeFeature.status)) {
        return Phase.TRANSITION
      }
    }

    // 6. All features in terminal status (none NOT_STARTED or IN_PROGRESS) → TRANSITION
    const hasActive = state.features.some(f => f.status === 'NOT_STARTED' || f.status === 'IN_PROGRESS')
    if (!hasActive && state.features.length > 0) {
      return Phase.TRANSITION
    }

    // 7. Default: PLANNING (product files exist, feature is NOT_STARTED, no specs yet)
    return Phase.PLANNING
  }
}
