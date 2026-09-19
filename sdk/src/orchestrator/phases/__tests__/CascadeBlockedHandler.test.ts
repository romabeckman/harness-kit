import { describe, expect, it, vi } from 'vitest'
import { CascadeBlockedHandler } from '../CascadeBlockedHandler'
import { Complexity, Phase } from '../../types'

describe('CascadeBlockedHandler', () => {
  it('keeps feature and task statuses synchronized when a dependency blocks execution', async () => {
    const activeFeature = {
      id: 'F002', title: 'Dependent feature', domain: 'core', priority: 2,
      dependencies: ['F001'], reworks: 0, scoreTL: null, scoreAdv: null,
      status: 'NOT_STARTED' as const,
    }
    const fsm = {
      loadBacklog: vi.fn().mockReturnValue([activeFeature]),
      updateFeatureStatus: vi.fn(),
      updateAllFeatureTasks: vi.fn(),
      appendDecision: vi.fn(),
    }
    const context = {
      config: { scope: 'test', projectPaths: [], complexity: Complexity.AUTO },
      workingDir: '/tmp/test', fsm, invokeAgent: vi.fn(),
      getActiveFeature: vi.fn().mockReturnValue(activeFeature),
      checkSpecFilesPresent: vi.fn(), extractTasksFromTacticalDesign: vi.fn(),
    } as any

    const result = await new CascadeBlockedHandler().handle(Phase.CASCADE_BLOCKED, context)

    expect(result).toBe(Phase.TRANSITION)
    expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F002', 'BLOCKED')
    expect(fsm.updateAllFeatureTasks).toHaveBeenCalledWith('F002', '-', 'BLOCKED')
  })
})
