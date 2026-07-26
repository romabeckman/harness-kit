import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PhaseEHandler } from '../../../src/orchestrator/phases/PhaseEHandler'
import { Phase } from '../../../src/orchestrator/types'

vi.mock('../../../src/context-assembler/ContextAssembler', () => ({
  ContextAssembler: {
    buildPhaseEPayload: vi.fn().mockReturnValue({
      domain: 'cli',
      scopeDescription: 'some scope',
      projectPaths: ['/src'],
      workingDir: '/mock/dir',
      steeringRules: [],
    }),
  },
}))

vi.mock('../../../src/orchestrator/services/PhaseDecisionLogger', () => ({
  PhaseDecisionLogger: {
    logPhaseE: vi.fn(),
  },
}))

describe('PhaseEHandler', () => {
  let handler: PhaseEHandler
  let mockContext: any

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new PhaseEHandler()

    mockContext = {
      workingDir: '/mock/dir',
      config: { projectPaths: ['/src'] },
      invokeAgent: vi.fn().mockResolvedValue({ raw: '{}', artefacts: {} }),
      getActiveFeature: vi.fn().mockReturnValue({ id: 'F001', domain: 'cli', reworks: 0 }),
      fsm: {
        loadBacklog: vi.fn().mockReturnValue([]),
        loadBootstrapConfig: vi.fn().mockReturnValue({
          cycleCounter: { completedCycles: 1 },
          steeringRules: {},
        }),
        loadRecentDecisions: vi.fn().mockReturnValue([]),
      },
    }
  })

  it('delegates to next handler when phase is not PHASE_E', async () => {
    const next = { handle: vi.fn().mockResolvedValue(Phase.PHASE_F) }
    handler.setNext(next as any)
    const result = await handler.handle(Phase.PHASE_D, mockContext)
    expect(next.handle).toHaveBeenCalled()
    expect(result).toBe(Phase.PHASE_F)
  })

  it('invokes project-memory agent and proceeds to PHASE_F normally', async () => {
    const result = await handler.handle(Phase.PHASE_E, mockContext)
    expect(mockContext.invokeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ phaseKey: 'phase_e' })
    )
    expect(result).toBe(Phase.PHASE_F)
  })

  it('deve pular Phase E inteira quando skipSteering=true no config', async () => {
    mockContext.config = { projectPaths: ['/src'], skipSteering: true }

    const result = await handler.handle(Phase.PHASE_E, mockContext)

    // No agent must be called
    expect(mockContext.invokeAgent).not.toHaveBeenCalled()
    // Must jump directly to Phase F
    expect(result).toBe(Phase.PHASE_F)
  })
})
