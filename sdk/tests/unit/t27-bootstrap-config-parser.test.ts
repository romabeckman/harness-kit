import { describe, it, expect } from 'vitest'
import { BootstrapConfigParser } from '../../src/file-state/parsers/BootstrapConfigParser'

describe('T27 — BootstrapConfigParser', () => {
  it('TC-BCP-01: parses valid complete JSON correctly', () => {
    // Arrange
    const json = JSON.stringify({
      projectPaths: ['/p1'],
      scoreThresholdTL: 0.85,
      scoreThresholdAdv: 0.9,
      completionCriteria: {
        maxReworks: 3
      },
      cycleCounter: {
        completedCycles: 1
      },
      currentPhase: 'PLANNING',
      activeFeatureId: 'F002'
    })

    // Act
    const config = BootstrapConfigParser.parse(json)

    // Assert
    expect(config.projectPaths).toEqual(['/p1'])
    expect(config.scoreThresholdTL).toBe(0.85)
    expect(config.scoreThresholdAdv).toBe(0.9)
    expect(config.completionCriteria.maxReworks).toBe(3)
    expect(config.cycleCounter.completedCycles).toBe(1)
    expect(config.currentPhase).toBe('PLANNING')
    expect(config.activeFeatureId).toBe('F002')
  })

  it('TC-BCP-02: clamps thresholds to [0,1] and maxReworks to >= 1', () => {
    // Arrange
    const json = JSON.stringify({
      scoreThresholdTL: 1.5,
      scoreThresholdAdv: -0.5,
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
    expect(config.scoreThresholdTL).toBe(1.0)
    expect(config.scoreThresholdAdv).toBe(0.0)
    expect(config.completionCriteria.maxReworks).toBe(1)
  })

  it('TC-BCP-03: parses legacy steeringRules array into user rules', () => {
    // Arrange
    const json = JSON.stringify({
      scoreThresholdTL: 0.7, scoreThresholdAdv: 0.7,
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
      scoreThresholdTL: 0.7, scoreThresholdAdv: 0.7,
      completionCriteria: { maxReworks: 2 },
      cycleCounter: { completedCycles: 0 },
      steeringRules: {
        user: ['u1'],
        bootstrap: ['b1'],
        planning: ['a1'],
        implementation: ['b2'],
        review: ['c1'],
        memory: ['e1']
      }
    })

    // Act
    const config = BootstrapConfigParser.parse(json)

    // Assert
    expect(config.steeringRules).toEqual({
      user: ['u1'],
      bootstrap: ['b1'],
      planning: ['a1'],
      implementation: ['b2'],
      review: ['c1'],
      memory: ['e1']
    })
  })

  it('TC-BCP-05: provides default steeringRules when missing or invalid type', () => {
    // Arrange
    const json = JSON.stringify({
      scoreThresholdTL: 0.7, scoreThresholdAdv: 0.7,
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
