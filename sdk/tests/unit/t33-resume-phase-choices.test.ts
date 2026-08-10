import { describe, it, expect } from 'vitest'
import { buildResumePhaseChoices } from '../../src/cli/services/run-service'
import { Phase } from '../../src/orchestrator/types'

describe('buildResumePhaseChoices', () => {
  it('returns only "continue" for PLANNING phase (no earlier phases)', () => {
    const choices = buildResumePhaseChoices(Phase.PLANNING)
    expect(choices).not.toBeNull()
    expect(choices).toHaveLength(1)
    expect(choices![0]).toEqual({
      name: expect.stringContaining('PLANNING'),
      value: Phase.PLANNING,
    })
  })

  it('returns "continue at DEVELOPMENT" and "go back to PLANNING" for DEVELOPMENT phase', () => {
    const choices = buildResumePhaseChoices(Phase.DEVELOPMENT)
    expect(choices).not.toBeNull()
    expect(choices).toHaveLength(2)
    expect(choices![0].value).toBe(Phase.DEVELOPMENT)
    expect(choices![1].value).toBe(Phase.PLANNING)
  })

  it('returns "continue at REVIEW", "go back to DEVELOPMENT", and "go back to PLANNING" for REVIEW phase', () => {
    const choices = buildResumePhaseChoices(Phase.REVIEW)
    expect(choices).not.toBeNull()
    expect(choices).toHaveLength(3)
    expect(choices![0].value).toBe(Phase.REVIEW)
    expect(choices![1].value).toBe(Phase.DEVELOPMENT)
    expect(choices![2].value).toBe(Phase.PLANNING)
  })

  it('returns null for phases not in the resumable set (e.g., BOOTSTRAP)', () => {
    const choices = buildResumePhaseChoices(Phase.BOOTSTRAP)
    expect(choices).toBeNull()
  })

  it('returns null for MEMORY phase', () => {
    const choices = buildResumePhaseChoices(Phase.MEMORY)
    expect(choices).toBeNull()
  })

  it('returns null for HALTED phase', () => {
    const choices = buildResumePhaseChoices(Phase.HALTED)
    expect(choices).toBeNull()
  })

  it('returns null for DEPLOY phase', () => {
    const choices = buildResumePhaseChoices(Phase.DEPLOY)
    expect(choices).toBeNull()
  })

  it('returns null for TRANSITION phase', () => {
    const choices = buildResumePhaseChoices(Phase.TRANSITION)
    expect(choices).toBeNull()
  })

  it('"continue" choice is always first in the list', () => {
    for (const phase of [Phase.PLANNING, Phase.DEVELOPMENT, Phase.REVIEW]) {
      const choices = buildResumePhaseChoices(phase)
      expect(choices).not.toBeNull()
      expect(choices![0].value).toBe(phase)
    }
  })

  it('DEVELOPMENT choices have correct labels', () => {
    const choices = buildResumePhaseChoices(Phase.DEVELOPMENT)!
    expect(choices[0].name).toContain('Continue')
    expect(choices[0].name).toContain('DEVELOPMENT')
    expect(choices[1].name).toContain('PLANNING')
  })

  it('REVIEW choices have correct labels', () => {
    const choices = buildResumePhaseChoices(Phase.REVIEW)!
    expect(choices[0].name).toContain('Continue')
    expect(choices[0].name).toContain('REVIEW')
    expect(choices[1].name).toContain('DEVELOPMENT')
    expect(choices[2].name).toContain('PLANNING')
  })
})
