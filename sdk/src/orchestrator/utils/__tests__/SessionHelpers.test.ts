import { describe, it, expect } from 'vitest'
import { Phase } from '../../types'
import { clearFeatureDeveloperSessions } from '../SessionHelpers'
import type { Reviewontext } from '../../phases/AbstractPhaseHandler'

describe('clearFeatureDeveloperSessions', () => {
  it('does nothing when developerSession is undefined', () => {
    const context = { developerSession: undefined } as unknown as Reviewontext
    clearFeatureDeveloperSessions(context)
    expect(context.developerSession).toBeUndefined()
  })

  it('clears single non-planning developerSession', () => {
    const context = {
      developerSession: {
        featureId: 'F001',
        agent: 'harness-kit:developer-backend',
        session: { id: 'DEV-1' },
        phase: Phase.DEVELOPMENT,
      },
    } as unknown as Reviewontext

    clearFeatureDeveloperSessions(context)
    expect(context.developerSession).toBeUndefined()
  })

  it('preserves single PLANNING developerSession', () => {
    const planningSession = {
      featureId: '',
      agent: 'harness-kit:software-architect',
      session: { id: 'PLAN-1' },
      phase: Phase.PLANNING,
    }
    const context = {
      developerSession: planningSession,
    } as unknown as Reviewontext

    clearFeatureDeveloperSessions(context)
    expect(context.developerSession).toEqual(planningSession)
  })

  it('filters out non-planning sessions from array and keeps PLANNING sessions', () => {
    const planningSession = {
      featureId: '',
      agent: 'harness-kit:software-architect',
      session: { id: 'PLAN-1' },
      phase: Phase.PLANNING,
    }
    const devSession = {
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-1' },
      phase: Phase.DEVELOPMENT,
    }
    const reviewSession = {
      featureId: 'F001',
      agent: 'harness-kit:harness-tech-lead',
      session: { id: 'TL-1' },
      phase: Phase.REVIEW,
    }

    const context = {
      developerSession: [planningSession, devSession, reviewSession],
    } as unknown as Reviewontext

    clearFeatureDeveloperSessions(context)
    expect(context.developerSession).toEqual([planningSession])
  })

  it('sets developerSession to undefined when array contains no PLANNING sessions', () => {
    const devSession = {
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-1' },
      phase: Phase.DEVELOPMENT,
    }
    const reviewSession = {
      featureId: 'F001',
      agent: 'harness-kit:harness-tech-lead',
      session: { id: 'TL-1' },
      phase: Phase.REVIEW,
    }

    const context = {
      developerSession: [devSession, reviewSession],
    } as unknown as Reviewontext

    clearFeatureDeveloperSessions(context)
    expect(context.developerSession).toBeUndefined()
  })
})
