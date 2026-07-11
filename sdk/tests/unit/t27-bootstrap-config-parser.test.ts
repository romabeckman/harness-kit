import { describe, it, expect } from 'vitest'
import { BootstrapConfigParser } from '../../src/file-state/parsers/BootstrapConfigParser'

describe('T27 — BootstrapConfigParser', () => {
  it('TC-BCP-01: parses valid complete JSON correctly', () => {
    // Arrange
    const json = JSON.stringify({
      projectPaths: ['/p1'],
      scoreThresholds: {
        theGrumpyTechLead: { threshold: 0.85 },
        adversarialQA: { threshold: 0.9 }
      },
      completionCriteria: {
        maxReworks: 3
      },
      cycleCounter: {
        completedCycles: 1
      },
      currentPhase: 'PHASE_A',
      activeFeatureId: 'F002',
      originalScope: 'Define user authentication module'
    })

    // Act
    const config = BootstrapConfigParser.parse(json)

    // Assert
    expect(config.projectPaths).toEqual(['/p1'])
    expect(config.scoreThresholds.theGrumpyTechLead.threshold).toBe(0.85)
    expect(config.scoreThresholds.adversarialQA.threshold).toBe(0.9)
    expect(config.completionCriteria.maxReworks).toBe(3)
    expect(config.cycleCounter.completedCycles).toBe(1)
    expect(config.currentPhase).toBe('PHASE_A')
    expect(config.activeFeatureId).toBe('F002')
    expect(config.originalScope).toBe('Define user authentication module')
  })

  it('TC-BCP-02: clamps thresholds to [0,1] and maxReworks to >= 1', () => {
    // Arrange
    const json = JSON.stringify({
      scoreThresholds: {
        theGrumpyTechLead: { threshold: 1.5 },
        adversarialQA: { threshold: -0.5 }
      },
      completionCriteria: {
        maxReworks: 0
      },
      cycleCounter: {
        completedCycles: 0
      }
    })

    // Act
    const config = BootstrapConfigParser.parse(json)

    // Assert
    expect(config.scoreThresholds.theGrumpyTechLead.threshold).toBe(1.0)
    expect(config.scoreThresholds.adversarialQA.threshold).toBe(0.0)
    expect(config.completionCriteria.maxReworks).toBe(1)
  })

  it('TC-BCP-03: parses legacy steeringRules array into user rules', () => {
    // Arrange
    const json = JSON.stringify({
      scoreThresholds: { theGrumpyTechLead: { threshold: 0.7 }, adversarialQA: { threshold: 0.7 } },
      completionCriteria: { maxReworks: 2 },
      cycleCounter: { completedCycles: 0 },
      steeringRules: ['rule1', 'rule2', 123] // non-string ignored
    })

    // Act
    const config = BootstrapConfigParser.parse(json)

    // Assert
    expect(config.steeringRules?.user).toEqual(['rule1', 'rule2'])
  })

  it('TC-BCP-04: parses object steeringRules format correctly', () => {
    // Arrange
    const json = JSON.stringify({
      scoreThresholds: { theGrumpyTechLead: { threshold: 0.7 }, adversarialQA: { threshold: 0.7 } },
      completionCriteria: { maxReworks: 2 },
      cycleCounter: { completedCycles: 0 },
      steeringRules: {
        user: ['u1'],
        bootstrap: ['b1'],
        phase_a: ['a1'],
        phase_b: ['b2'],
        phase_c: ['c1'],
        phase_e: ['e1']
      }
    })

    // Act
    const config = BootstrapConfigParser.parse(json)

    // Assert
    expect(config.steeringRules).toEqual({
      user: ['u1'],
      bootstrap: ['b1'],
      phase_a: ['a1'],
      phase_b: ['b2'],
      phase_c: ['c1'],
      phase_e: ['e1']
    })
  })

  it('TC-BCP-05: provides default steeringRules when missing or invalid type', () => {
    // Arrange
    const json = JSON.stringify({
      scoreThresholds: { theGrumpyTechLead: { threshold: 0.7 }, adversarialQA: { threshold: 0.7 } },
      completionCriteria: { maxReworks: 2 },
      cycleCounter: { completedCycles: 0 },
      steeringRules: 'invalid-string-type'
    })

    // Act
    const config = BootstrapConfigParser.parse(json)

    // Assert
    expect(config.steeringRules).toBeDefined()
    expect(Array.isArray(config.steeringRules?.user)).toBe(true)
  })
})
