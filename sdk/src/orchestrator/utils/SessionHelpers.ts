import { Phase } from '../types'
import type { Reviewontext } from '../phases/AbstractPhaseHandler'

/**
 * Retains only Phase.PLANNING developer sessions while clearing feature-specific
 * dev/review sessions across phase transitions or feature completions.
 */
export function clearFeatureDeveloperSessions(context: Reviewontext): void {
  if (Array.isArray(context.developerSession)) {
    context.developerSession = context.developerSession.filter(s => s.phase === Phase.PLANNING)
    if (context.developerSession.length === 0) {
      context.developerSession = undefined
    }
  } else if (context.developerSession?.phase !== Phase.PLANNING) {
    context.developerSession = undefined
  }
}
