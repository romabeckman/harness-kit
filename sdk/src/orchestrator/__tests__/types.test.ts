import { describe, it, expect } from 'vitest'
import { Phase, OrchestratorConfig } from '../types'

describe('Orchestrator Types', () => {
  it('includes REFINEMENT phase', () => {
    expect(Phase.REFINEMENT).toBe('REFINEMENT')
  })

  it('supports enableRefinement in OrchestratorConfig', () => {
    const config: OrchestratorConfig = {
      scope: 'test',
      projectPaths: [],
      complexity: 'AUTO' as any,
      enableRefinement: true,
    }
    expect(config.enableRefinement).toBe(true)
  })
})
