import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryHandler } from '../../../src/orchestrator/phases/MemoryHandler'
import { Phase } from '../../../src/orchestrator/types'
import { join } from 'node:path'

vi.mock('../../../src/context-assembler/ContextAssembler', () => ({
  ContextAssembler: {
    buildMemoryPayload: vi.fn().mockReturnValue({
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
    logMemory: vi.fn(),
  },
}))

describe('MemoryHandler', () => {
  let handler: MemoryHandler
  let mockContext: any

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new MemoryHandler()

    mockContext = {
      workingDir: '/mock/dir',
      config: { projectPaths: ['/src'], scope: 'mock scope' },
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

  it('delegates to next handler when phase is not MEMORY', async () => {
    const next = { handle: vi.fn().mockResolvedValue(Phase.TRANSITION) }
    handler.setNext(next as any)
    const result = await handler.handle(Phase.TRANSITION, mockContext)
    expect(next.handle).toHaveBeenCalled()
    expect(result).toBe(Phase.TRANSITION)
  })

  it('invokes project-memory agent and proceeds to TRANSITION normally', async () => {
    const result = await handler.handle(Phase.MEMORY, mockContext)
    expect(mockContext.invokeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        skill: 'harness-kit:project-memory',
        phaseKey: 'memory',
        prompt: expect.stringContaining(join('/mock/dir', 'docs', 'specs', '[domain]', '*.md')),
      })
    )
    const prompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string
    expect(prompt).not.toContain(join('/mock/dir', 'docs', 'product', 'specs'))
    expect(prompt).not.toContain('/harness-kit:project-memory')
    expect(prompt).toContain('docs/feature/*.md')
    expect(result).toBe(Phase.DEPLOY)
  })

  it('deve pular Phase E inteira quando skipMemory=true no config', async () => {
    mockContext.config = { projectPaths: ['/src'], skipMemory: true }

    const result = await handler.handle(Phase.MEMORY, mockContext)

    // No agent must be called
    expect(mockContext.invokeAgent).not.toHaveBeenCalled()
    // Must jump directly to Phase F
    expect(result).toBe(Phase.DEPLOY)
  })
})
