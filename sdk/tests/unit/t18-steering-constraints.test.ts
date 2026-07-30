import { describe, it, expect } from 'vitest'
import { ContextAssembler } from '../../src/context-assembler/ContextAssembler'
import type { Feature, Task, SteeringRulesConfig } from '../../src/file-state/types'

const feature: Feature = {
  id: 'F001',
  title: 'SDK Core',
  domain: 'sdk_core',
  priority: 1,
  dependencies: [],
  reworks: 0,
  scoreTL: null,
  scoreAdv: null,
  status: 'NOT_STARTED',
}

const tasks: Task[] = [
  { featureId: 'F001', taskId: 'T01', project: 'sdk', description: 'init scaffold', domain: 'sdk_core', currentPhase: '-', status: 'NOT_STARTED' },
]

describe('Steering Rules Injection', () => {
  it('should include user steering rules in Phase A, B, C, and E payloads when rules are provided', () => {
    const rules: SteeringRulesConfig = {
      user: ['User Rule 1', 'User Rule 2']
    }

    const payloadA = ContextAssembler.buildPlanningPayload(feature, '/dummy/workdir', ['/path'], 'Original Scope', rules)
    expect(payloadA.steeringRules).toContain('User Rule 1')
    expect(payloadA.steeringRules).toContain('User Rule 2')

    const payloadB = ContextAssembler.buildDevelopmenPayload(feature, 'workdir', tasks, ['/path'], false, 0, rules)
    expect(payloadB.steeringRules).toContain('User Rule 1')
    expect(payloadB.steeringRules).toContain('User Rule 2')

    const payloadC = ContextAssembler.buildReviewPayload(feature, 'workdir', ['/path'], rules)
    expect(payloadC.steeringRules).toContain('User Rule 1')
    expect(payloadC.steeringRules).toContain('User Rule 2')

    const payloadE = ContextAssembler.buildMemoryPayload(['/path'], 'workdir', rules)
    expect(payloadE.steeringRules).toContain('User Rule 1')
    expect(payloadE.steeringRules).toContain('User Rule 2')
  })

  it('should include Phase B specific rule in Phase B payload rules list', () => {
    const rules: SteeringRulesConfig = {
      user: ['User Rule 1'],
      implementation: ['Limit of 5 tasks for feature']
    }
    const payloadB = ContextAssembler.buildDevelopmenPayload(feature, 'workdir', tasks, ['/path'], false, 0, rules)
    expect(payloadB.steeringRules).toEqual([
      'Limit of 5 tasks for feature',
      'User Rule 1'
    ])
  })

  it('should include phase-specific rules without formatting or prefixing', () => {
    const rules: SteeringRulesConfig = {
      implementation: ['Phase B: Limit of 5 tasks for feature']
    }
    const payloadB = ContextAssembler.buildDevelopmenPayload(feature, 'workdir', tasks, ['/path'], false, 0, rules)
    expect(payloadB.steeringRules).toEqual([
      'Phase B: Limit of 5 tasks for feature'
    ])
  })

  it('should not affect Phase A, C, or E payloads with Phase B rules', () => {
    const rules: SteeringRulesConfig = {
      implementation: ['Limit of 5 tasks for feature']
    }
    const payloadA = ContextAssembler.buildPlanningPayload(feature, '/dummy/workdir', ['/path'], 'Original Scope', rules)
    expect(payloadA.steeringRules).toBeUndefined()

    const payloadC = ContextAssembler.buildReviewPayload(feature, 'workdir', ['/path'], rules)
    expect(payloadC.steeringRules).toBeUndefined()

    const payloadE = ContextAssembler.buildMemoryPayload(['/path'], 'workdir', rules)
    expect(payloadE.steeringRules).toBeUndefined()
  })

  it('should include bootstrap-specific rule in flattenRules', () => {
    const rules: SteeringRulesConfig = {
      bootstrap: ['Limit features generated'],
      user: ['Global Rule']
    }
    // @ts-expect-error - flattenRules is private but we test it via buildPlanningPayload with custom mapping or directly via reflection
    const flattened = ContextAssembler['flattenRules']('BOOTSTRAP', rules)
    expect(flattened).toEqual([
      'Limit features generated',
      'Global Rule'
    ])
  })
})
