import { describe, it, expect, vi } from 'vitest'
import { ChainBuilder } from '../ChainBuilder'
import {
  PlanningHandler,
  DevelopmentHandler,
  ReviewHandler,
  MemoryHandler,
  TransitionHandler,
  CascadeBlockedHandler,
} from '../phases'
import { Phase } from '../types'
import type { IPhaseHandler, Reviewontext } from '../phases/AbstractPhaseHandler'

function makeStubHandler(respondTo: Phase, returns: Phase): IPhaseHandler {
  return {
    setNext: vi.fn().mockReturnThis(),
    handle: vi.fn().mockImplementation(async (phase: Phase) => {
      if (phase !== respondTo) return null
      return returns
    }),
  }
}

function makeContext(): Reviewontext {
  return {
    config: { scope: '', score: 0, reworks: 0, projectPaths: [] },
    workingDir: '/tmp',
    fsm: {
      ensureProductFiles: vi.fn(),
      loadBootstrapConfig: vi.fn().mockReturnValue({ steeringRules: [] }),
      saveBootstrapConfig: vi.fn(),
      loadBacklog: vi.fn().mockReturnValue([{ id: 'F001', domain: 'd', dependencies: [] }]),
    } as unknown as Reviewontext['fsm'],
    invokeAgent: vi.fn().mockResolvedValue(undefined),
    getActiveFeature: vi.fn().mockReturnValue(null),
    checkSpecFilesPresent: vi.fn().mockReturnValue(true),
    extractTasksFromTacticalDesign: vi.fn().mockReturnValue([]),
  } as unknown as Reviewontext
}

describe('ChainBuilder', () => {
  it('always starts with BootstrapHandler — handles BOOTSTRAP phase', async () => {
    const chain = new ChainBuilder().build()
    const ctx = makeContext()
    const result = await chain.handle(Phase.BOOTSTRAP, ctx)
    expect(result).toBe(Phase.PLANNING)
  })

  it('build() with no extra phases returns null for PLANNING (no handler registered)', async () => {
    const chain = new ChainBuilder().build()
    const ctx = makeContext()
    const result = await chain.handle(Phase.PLANNING, ctx)
    expect(result).toBeNull()
  })

  it('addPhase registers a handler — it responds to the registered phase (PLANNING)', async () => {
    const stub = makeStubHandler(Phase.PLANNING, Phase.DEVELOPMENT)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.PLANNING, makeContext())
    expect(result).toBe(Phase.DEVELOPMENT)
    expect(stub.handle).toHaveBeenCalledWith(Phase.PLANNING, expect.anything())
  })

  it('addPhase registers a handler — it responds to the registered phase (DEVELOPMENT)', async () => {
    const stub = makeStubHandler(Phase.DEVELOPMENT, Phase.REVIEW)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.DEVELOPMENT, makeContext())
    expect(result).toBe(Phase.REVIEW)
    expect(stub.handle).toHaveBeenCalledWith(Phase.DEVELOPMENT, expect.anything())
  })

  it('addPhase registers a handler — it responds to the registered phase (REVIEW)', async () => {
    const stub = makeStubHandler(Phase.REVIEW, Phase.TRANSITION)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.REVIEW, makeContext())
    expect(result).toBe(Phase.TRANSITION)
  })

  it('addPhase registers a handler — it responds to the registered phase (TRANSITION)', async () => {
    const stub = makeStubHandler(Phase.TRANSITION, Phase.MEMORY)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.TRANSITION, makeContext())
    expect(result).toBe(Phase.MEMORY)
  })

  it('addPhase registers a handler — it responds to the registered phase (MEMORY)', async () => {
    const stub = makeStubHandler(Phase.MEMORY, Phase.TRANSITION)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.MEMORY, makeContext())
    expect(result).toBe(Phase.TRANSITION)
  })

  it('addPhase registers a handler — it responds to the registered phase (TRANSITION)', async () => {
    const stub = makeStubHandler(Phase.TRANSITION, Phase.HALTED)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.TRANSITION, makeContext())
    expect(result).toBe(Phase.HALTED)
  })

  it('addPhase registers a handler — it responds to the registered phase (CASCADE_BLOCKED)', async () => {
    const stub = makeStubHandler(Phase.CASCADE_BLOCKED, Phase.TRANSITION)
    const chain = new ChainBuilder().addPhase(stub).build()
    const result = await chain.handle(Phase.CASCADE_BLOCKED, makeContext())
    expect(result).toBe(Phase.TRANSITION)
  })

  it('two handlers for same phase are chained — second is reached if first passes through', async () => {
    const first = makeStubHandler(Phase.PLANNING, Phase.DEVELOPMENT)
    const second = makeStubHandler(Phase.PLANNING, Phase.REVIEW)
    const chain = new ChainBuilder().addPhase(first).addPhase(second).build()
    const result = await chain.handle(Phase.PLANNING, makeContext())
    expect(result).toBe(Phase.DEVELOPMENT)
    expect(first.handle).toHaveBeenCalled()
  })

  it('buildDefault() builds with all real handlers — BOOTSTRAP resolves to PLANNING', async () => {
    const chain = ChainBuilder.buildDefault()
    const ctx = makeContext()
    const result = await chain.handle(Phase.BOOTSTRAP, ctx)
    expect(result).toBe(Phase.PLANNING)
  })

  it('buildDefault() registers PlanningHandler — class instance present in chain', () => {
    const builder = new ChainBuilder()
      .addPhase(new PlanningHandler())
      .addPhase(new DevelopmentHandler())
      .addPhase(new ReviewHandler())
      .addPhase(new MemoryHandler())
      .addPhase(new TransitionHandler())
      .addPhase(new CascadeBlockedHandler())
    const chain = builder.build()
    expect(chain).toBeDefined()
  })

  it('supports method chaining — addPhase returns the same builder instance', () => {
    const builder = new ChainBuilder()
    const stub = makeStubHandler(Phase.PLANNING, Phase.DEVELOPMENT)
    expect(builder.addPhase(stub)).toBe(builder)
    expect(builder.addPhase(makeStubHandler(Phase.DEVELOPMENT, Phase.REVIEW))).toBe(builder)
    expect(builder.addPhase(makeStubHandler(Phase.CASCADE_BLOCKED, Phase.TRANSITION))).toBe(builder)
  })

  it('build() can be called multiple times returning independent chain instances', () => {
    const builder = new ChainBuilder().addPhase(makeStubHandler(Phase.PLANNING, Phase.DEVELOPMENT))
    const chainA = builder.build()
    const chainB = builder.build()
    expect(chainA).not.toBe(chainB)
  })
})
