import { Phase } from './types'
import type { OnDiskState } from './types'

/**
 * Encodes the State Transition Table as ordered predicates.
 * resolve() scans in order — first matching condition wins.
 *
 * State Transition Table (ordered):
 * 1. No product files → BOOTSTRAP
 * 2. Active feature dependency is BLOCKED → CASCADE_BLOCKED
 * 3. Active feature in terminal status (COMPLETED/BLOCKED/FAILED) → TRANSITION
 * 4. All active feature tasks COMPLETED → REVIEW
 * 5. Ready spec files with unfinished tasks → DEVELOPMENT
 * 6. No active feature or feature NOT_STARTED with no specs → PLANNING
 * 7. Fallback → BOOTSTRAP
 */
export class ReentryResolver {
  static resolve(state: OnDiskState): Phase {
    const activeStatus = state.activeFeature?.status
    const terminalFeature = activeStatus === 'COMPLETED' || activeStatus === 'BLOCKED' || activeStatus === 'FAILED'
    // 0. Respect saved phases except stale startup markers for populated backlogs.
    if (state.config?.currentPhase) {
      const persistedPhase = state.config.currentPhase as Phase
      const backlogAlreadyPopulated = state.productFilesExist && state.features.length > 0
      const staleInitialPhase = backlogAlreadyPopulated &&
        (persistedPhase === Phase.BOOTSTRAP || persistedPhase === Phase.REFINEMENT)
      if (Object.values(Phase).includes(persistedPhase) && persistedPhase !== Phase.HALTED) {
        if (terminalFeature && (persistedPhase === Phase.DEVELOPMENT || persistedPhase === Phase.REVIEW)) {
          return Phase.TRANSITION
        }
        // REVIEW also handles invalid or absent TDD results; do not repeat development on resume.
        if (!staleInitialPhase) {
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

    // 3. A terminal feature still needs TRANSITION even when old specs and output remain.
    if (terminalFeature) return Phase.TRANSITION

    // 4. Completed tasks are ready for review even when the handoff is unavailable.
    if (state.allTasksCompleted) {
      return Phase.REVIEW
    }

    // 5. Ready specs with unfinished tasks → DEVELOPMENT
    if (state.specFilesPresent) {
      return Phase.DEVELOPMENT
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
