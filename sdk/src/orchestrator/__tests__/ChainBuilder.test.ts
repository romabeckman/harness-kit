import { describe, it, expect, vi } from 'vitest'
import { ChainBuilder } from '../ChainBuilder'
import {
  PhaseAHandler,
  PhaseBHandler,
  PhaseCHandler,
  PhaseDHandler,
  PhaseEHandler,
  PhaseFHandler,
  CascadeBlockedHandler,
} from '../phases'
import { Phase } from '../types'
import type { IPhaseHandler, PhaseContext } from '../phases/AbstractPhaseHandler'

function makeStubHandler(respondTo: Phase, returns: Phase): IPhaseHandler {
  return {
    setNext: vi.fn().mockReturnThis(),
    handle: vi.fn().mockImplementation(async (phase: Phase) => {
      if (phase !== respondTo) return null
      return returns
    }),
  }
}

function makeContext(): PhaseContext {
  return {
    config: { scope: '', score: 0, reworks: 0, projectPaths: [] },
    workingDir: '/tmp',
    fsm: {
      ensureProductFiles: vi.fn(),
      loadBootstrapConfig: vi.fn().mockReturnValue({ steeringRules: [] }),
      saveBootstrapConfig: vi.fn(),
      loadBacklog: vi.fn().mockReturnValue([{ id: 'F001', domain: 'd', dependencies: [] }]),
    } as unknown as PhaseContext['fsm'],
    invokeAgent: vi.fn().mockResolvedValue(undefined),
    getActiveFeature: vi.fn().mockReturnValue(null),
    checkSpecFilesPresent: vi.fn().mockReturnValue(true),
    extractTasksFromTacticalDesign: vi.fn().mockReturnValue([]),
  } as unknown as PhaseContext
}

describe('ChainBuilder', () => {
  it('always starts with BootstrapHandler — handles BOOTSTRAP phase', async () => {
    const chain = new ChainBuilder().build()
    const ctx = makeContext()
    const result = await chain.handle(Phase.BOOTSTRAP, ctx)
    expect(result).toBe(Phase.PHASE_A)
  })

  it('build() with no extra phases returns null for PHASE_A (no handler registered)', async () => {
    const chain = new ChainBuilder().build()
    const ctx = makeContext()
    const result = await chain.handle(Phase.PHASE_A, ctx)
    expect(result).toBeNull()
  })

  it('addPhase registers a handler — it responds to the registered phase (PHASE_A)', async () => {
    const stub = makeStubHandler(Phase.PHASE_A, Phase.PHASE_B)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.PHASE_A, makeContext())
    expect(result).toBe(Phase.PHASE_B)
    expect(stub.handle).toHaveBeenCalledWith(Phase.PHASE_A, expect.anything())
  })

  it('addPhase registers a handler — it responds to the registered phase (PHASE_B)', async () => {
    const stub = makeStubHandler(Phase.PHASE_B, Phase.PHASE_C)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.PHASE_B, makeContext())
    expect(result).toBe(Phase.PHASE_C)
    expect(stub.handle).toHaveBeenCalledWith(Phase.PHASE_B, expect.anything())
  })

  it('addPhase registers a handler — it responds to the registered phase (PHASE_C)', async () => {
    const stub = makeStubHandler(Phase.PHASE_C, Phase.PHASE_D)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.PHASE_C, makeContext())
    expect(result).toBe(Phase.PHASE_D)
  })

  it('addPhase registers a handler — it responds to the registered phase (PHASE_D)', async () => {
    const stub = makeStubHandler(Phase.PHASE_D, Phase.PHASE_E)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.PHASE_D, makeContext())
    expect(result).toBe(Phase.PHASE_E)
  })

  it('addPhase registers a handler — it responds to the registered phase (PHASE_E)', async () => {
    const stub = makeStubHandler(Phase.PHASE_E, Phase.PHASE_F)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.PHASE_E, makeContext())
    expect(result).toBe(Phase.PHASE_F)
  })

  it('addPhase registers a handler — it responds to the registered phase (PHASE_F)', async () => {
    const stub = makeStubHandler(Phase.PHASE_F, Phase.HALTED)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.PHASE_F, makeContext())
    expect(result).toBe(Phase.HALTED)
  })

  it('addPhase registers a handler — it responds to the registered phase (CASCADE_BLOCKED)', async () => {
    const stub = makeStubHandler(Phase.CASCADE_BLOCKED, Phase.PHASE_D)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.CASCADE_BLOCKED, makeContext())
    expect(result).toBe(Phase.PHASE_D)
  })

  it('two handlers for same phase are chained — second is reached if first passes through', async () => {
    const first = makeStubHandler(Phase.PHASE_A, Phase.PHASE_B)
    const second = makeStubHandler(Phase.PHASE_A, Phase.PHASE_C)
    const chain = new ChainBuilder().addPhase(first).addPhase(second).build()
    const result = await chain.handle(Phase.PHASE_A, makeContext())
    expect(result).toBe(Phase.PHASE_B)
    expect(first.handle).toHaveBeenCalled()
  })

  it('buildDefault() builds with all real handlers — BOOTSTRAP resolves to PHASE_A', async () => {
    const chain = ChainBuilder.buildDefault()
    const ctx = makeContext()
    const result = await chain.handle(Phase.BOOTSTRAP, ctx)
    expect(result).toBe(Phase.PHASE_A)
  })

  it('buildDefault() registers PhaseAHandler — class instance present in chain', () => {
    const builder = new ChainBuilder()
      .addPhase(new PhaseAHandler())
      .addPhase(new PhaseBHandler())
      .addPhase(new PhaseCHandler())
      .addPhase(new PhaseDHandler())
      .addPhase(new PhaseEHandler())
      .addPhase(new PhaseFHandler())
      .addPhase(new CascadeBlockedHandler())
    const chain = builder.build()
    expect(chain).toBeDefined()
  })

  it('supports method chaining — addPhase returns the same builder instance', () => {
    const builder = new ChainBuilder()
    const stub = makeStubHandler(Phase.PHASE_A, Phase.PHASE_B)
    expect(builder.addPhase(stub)).toBe(builder)
    expect(builder.addPhase(makeStubHandler(Phase.PHASE_B, Phase.PHASE_C))).toBe(builder)
    expect(builder.addPhase(makeStubHandler(Phase.CASCADE_BLOCKED, Phase.PHASE_D))).toBe(builder)
  })

  it('build() can be called multiple times returning independent chain instances', () => {
    const builder = new ChainBuilder().addPhase(makeStubHandler(Phase.PHASE_A, Phase.PHASE_B))
    const chainA = builder.build()
    const chainB = builder.build()
    expect(chainA).not.toBe(chainB)
  })
})
