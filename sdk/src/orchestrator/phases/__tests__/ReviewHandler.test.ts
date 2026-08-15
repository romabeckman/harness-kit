import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ReviewHandler } from '../ReviewHandler'
import { Complexity, Phase } from '../../types'
import type { Reviewontext } from '../AbstractPhaseHandler'
import type { IFileStateManager } from '../../../file-state/FileStateManager'
import type { Feature, BootstrapConfig } from '../../../file-state/types'

function makeTempDir(): string {
  const dir = join(tmpdir(), `review-test-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'F001',
    title: 'Test Feature',
    domain: 'sdk_core',
    layer: 'backend',
    priority: 1,
    dependencies: [],
    reworks: 0,
    scoreTL: null,
    scoreAdv: null,
    status: 'IN_PROGRESS',
    ...overrides,
  }
}

function makeConfig(overrides: Partial<BootstrapConfig> = {}): BootstrapConfig {
  return {
    projectPaths: [],
    scoreThresholdTL: 0.85,
    scoreThresholdAdv: 0.85,
    completionCriteria: { maxReworks: 3 },
    cycleCounter: { completedCycles: 0 },
    steeringRules: { user: [] },
    ...overrides,
  }
}

function makeFsm(feature: Feature = makeFeature(), config: BootstrapConfig = makeConfig()): IFileStateManager {
  return {
    loadBacklog: vi.fn().mockReturnValue([feature]),
    loadBootstrapConfig: vi.fn().mockReturnValue(config),
    updateTaskStatus: vi.fn(),
    appendDecision: vi.fn(),
    updateFeatureStatus: vi.fn(),
    updateAllFeatureTasks: vi.fn(),
    incrementReworks: vi.fn(),
    writeReworkLog: vi.fn(),
  } as unknown as IFileStateManager
}

function makeContext(
  workingDir: string,
  fsm: IFileStateManager,
  invokeAgentImpl?: (inv: any) => Promise<any>,
  configOverrides: Partial<Reviewontext['config']> = {}
): Reviewontext {
  const ctx: Reviewontext = {
    config: { scope: 'test', score: 0.85, reworks: 3, projectPaths: [], complexity: Complexity.AUTO, ...configOverrides },
    workingDir,
    fsm,
    invokeAgent: invokeAgentImpl ? vi.fn().mockImplementation(invokeAgentImpl) : vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', raw: '{}' }),
    getActiveFeature: vi.fn().mockReturnValue(makeFeature()),
    checkSpecFilesPresent: vi.fn().mockReturnValue(true),
    extractTasksFromTacticalDesign: vi.fn().mockReturnValue([]),
    getDeveloperSession(agent: string, featureId?: string, phase?: Phase) {
      if (!ctx.developerSession) return undefined
      if (Array.isArray(ctx.developerSession)) {
        return ctx.developerSession.find(
          s => s.agent === agent && (!featureId || s.featureId === featureId) && (!phase || s.phase === phase)
        )?.session
      }
      const session = ctx.developerSession as any
      if (session.agent === agent && (!featureId || session.featureId === featureId) && (!phase || session.phase === phase)) {
        return session.session
      }
      return undefined
    },
    setDeveloperSession(sessionState: any) {
      if (!ctx.developerSession) {
        ctx.developerSession = [sessionState]
        return
      }
      if (Array.isArray(ctx.developerSession)) {
        const idx = ctx.developerSession.findIndex(
          s => s.agent === sessionState.agent && s.featureId === sessionState.featureId && s.phase === sessionState.phase
        )
        if (idx >= 0) {
          ctx.developerSession[idx] = sessionState
        } else {
          ctx.developerSession.push(sessionState)
        }
      } else {
        const existing = ctx.developerSession as any
        if (existing.agent === sessionState.agent && existing.featureId === sessionState.featureId && existing.phase === sessionState.phase) {
          ctx.developerSession = [sessionState]
        } else {
          ctx.developerSession = [existing, sessionState]
        }
      }
    },
  }
  return ctx
}

describe('ReviewHandler', () => {
  let handler: ReviewHandler
  let workingDir: string

  beforeEach(() => {
    handler = new ReviewHandler()
    workingDir = makeTempDir()
    mkdirSync(join(workingDir, 'docs', 'specs', 'sdk_core'), { recursive: true })
  })

  it('delegates when phase is not REVIEW', async () => {
    const fsm = makeFsm()
    const context = makeContext(workingDir, fsm)
    const result = await handler.handle(Phase.PLANNING, context)
    expect(result).toBeNull()
  })

  it('clears developerSession and transitions when skipValidation is true', async () => {
    const fsm = makeFsm()
    const context = makeContext(workingDir, fsm, undefined, { skipValidation: true })
    context.developerSession = {
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-123' },
      phase: Phase.DEVELOPMENT,
    }

    const result = await handler.handle(Phase.REVIEW, context)

    expect(result).toBe(Phase.TRANSITION)
    expect(context.developerSession).toBeUndefined()
  })

  it('invokes Tech Lead and Adversarial QA without passing developerSession', async () => {
    const fsm = makeFsm()
    const specsDir = join(workingDir, 'docs', 'specs', 'sdk_core')

    const context = makeContext(workingDir, fsm, async (inv: any) => {
      if (inv.phaseKey === 'review_tl') {
        const data = { featureId: 'F001', score: 0.95, openPoints: [], architectureTip: '' }
        writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      } else {
        const data = { featureId: 'F001', score: 0.95, passedAdversarial: true, vulnerabilities: [], edgeCasesMissed: [] }
        writeFileSync(join(specsDir, 'QA.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      }
    })
    context.developerSession = {
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-123' },
      phase: Phase.DEVELOPMENT,
    }

    await handler.handle(Phase.REVIEW, context)

    expect(context.invokeAgent).toHaveBeenCalledTimes(2)
    const tlCall = (context.invokeAgent as any).mock.calls[0][0]
    const qaCall = (context.invokeAgent as any).mock.calls[1][0]

    expect(tlCall.session).toBeUndefined()
    expect(qaCall.session).toBeUndefined()
  })

  it('preserves developerSession on RETRY verdict', async () => {
    const fsm = makeFsm()
    const specsDir = join(workingDir, 'docs', 'specs', 'sdk_core')

    const context = makeContext(workingDir, fsm, async (inv: any) => {
      if (inv.phaseKey === 'review_tl') {
        const data = { featureId: 'F001', score: 0.50, openPoints: ['[HIGH] Bug'], architectureTip: '' }
        writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      } else {
        const data = { featureId: 'F001', score: 0.50, passedAdversarial: false, vulnerabilities: [], edgeCasesMissed: ['Missed case'] }
        writeFileSync(join(specsDir, 'QA.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      }
    })
    context.developerSession = {
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-123' },
      phase: Phase.DEVELOPMENT,
    }

    const result = await handler.handle(Phase.REVIEW, context)

    expect(result).toBe(Phase.DEVELOPMENT)
    expect(context.developerSession).toEqual({
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-123' },
      phase: Phase.DEVELOPMENT,
    })
    expect(fsm.incrementReworks).toHaveBeenCalledWith('F001')
    expect(fsm.writeReworkLog).toHaveBeenCalled()
  })

  it('clears developerSession on PASS verdict before transitioning', async () => {
    const fsm = makeFsm()
    const specsDir = join(workingDir, 'docs', 'specs', 'sdk_core')

    const context = makeContext(workingDir, fsm, async (inv: any) => {
      if (inv.phaseKey === 'review_tl') {
        const data = { featureId: 'F001', score: 0.95, openPoints: [], architectureTip: '' }
        writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      } else {
        const data = { featureId: 'F001', score: 0.95, passedAdversarial: true, vulnerabilities: [], edgeCasesMissed: [] }
        writeFileSync(join(specsDir, 'QA.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      }
    })
    context.developerSession = {
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-123' },
      phase: Phase.DEVELOPMENT,
    }

    const result = await handler.handle(Phase.REVIEW, context)

    expect(result).toBe(Phase.TRANSITION)
    expect(context.developerSession).toBeUndefined()
  })

  it('captures and preserves sessions from invokeAgent output in developerSession array on RETRY', async () => {
    const fsm = makeFsm()
    const specsDir = join(workingDir, 'docs', 'specs', 'sdk_core')

    const context = makeContext(workingDir, fsm, async (inv: any) => {
      if (inv.phaseKey === 'review_tl') {
        const data = { featureId: 'F001', score: 0.50, openPoints: ['[HIGH] Bug'], architectureTip: '' }
        writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data), session: { id: 'TL-SESSION-1' } }
      } else {
        const data = { featureId: 'F001', score: 0.50, passedAdversarial: false, vulnerabilities: [], edgeCasesMissed: ['Missed case'] }
        writeFileSync(join(specsDir, 'QA.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data), session: { id: 'QA-SESSION-1' } }
      }
    })
    context.developerSession = [{
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-123' },
      phase: Phase.DEVELOPMENT,
    }]

    const result = await handler.handle(Phase.REVIEW, context)

    expect(result).toBe(Phase.DEVELOPMENT)
    expect(context.developerSession).toEqual([
      {
        featureId: 'F001',
        agent: 'harness-kit:developer-backend',
        session: { id: 'DEV-123' },
        phase: Phase.DEVELOPMENT,
      },
      {
        featureId: 'F001',
        agent: 'harness-kit:harness-tech-lead',
        session: { id: 'TL-SESSION-1' },
        phase: Phase.REVIEW,
      },
      {
        featureId: 'F001',
        agent: 'harness-kit:harness-qa',
        session: { id: 'QA-SESSION-1' },
        phase: Phase.REVIEW,
      }
    ])
  })

  it('reuses existing review sessions when invoking agents for the same feature and phase', async () => {
    const fsm = makeFsm()
    const specsDir = join(workingDir, 'docs', 'specs', 'sdk_core')

    const context = makeContext(workingDir, fsm, async (inv: any) => {
      if (inv.phaseKey === 'review_tl') {
        const data = { featureId: 'F001', score: 0.50, openPoints: ['[HIGH] Bug'], architectureTip: '' }
        writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data), session: { id: 'TL-SESSION-2' } }
      } else {
        const data = { featureId: 'F001', score: 0.50, passedAdversarial: false, vulnerabilities: [], edgeCasesMissed: ['Missed case'] }
        writeFileSync(join(specsDir, 'QA.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data), session: { id: 'QA-SESSION-2' } }
      }
    })
    context.developerSession = [
      {
        featureId: 'F001',
        agent: 'harness-kit:harness-tech-lead',
        session: { id: 'TL-SESSION-1' },
        phase: Phase.REVIEW,
      },
      {
        featureId: 'F001',
        agent: 'harness-kit:harness-qa',
        session: { id: 'QA-SESSION-1' },
        phase: Phase.REVIEW,
      }
    ]

    await handler.handle(Phase.REVIEW, context)

    expect(context.invokeAgent).toHaveBeenCalledTimes(2)
    const tlCall = (context.invokeAgent as any).mock.calls[0][0]
    const qaCall = (context.invokeAgent as any).mock.calls[1][0]

    expect(tlCall.session).toEqual({ id: 'TL-SESSION-1' })
    expect(qaCall.session).toEqual({ id: 'QA-SESSION-1' })
  })

  it('does NOT reuse review sessions belonging to a different phase', async () => {
    const fsm = makeFsm()
    const specsDir = join(workingDir, 'docs', 'specs', 'sdk_core')

    const context = makeContext(workingDir, fsm, async (inv: any) => {
      if (inv.phaseKey === 'review_tl') {
        const data = { featureId: 'F001', score: 0.95, openPoints: [], architectureTip: '' }
        writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      } else {
        const data = { featureId: 'F001', score: 0.95, passedAdversarial: true, vulnerabilities: [], edgeCasesMissed: [] }
        writeFileSync(join(specsDir, 'QA.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      }
    })
    context.developerSession = [
      {
        featureId: 'F001',
        agent: 'harness-kit:harness-tech-lead',
        session: { id: 'TL-DEV-PHASE' },
        phase: Phase.DEVELOPMENT,
      },
      {
        featureId: 'F001',
        agent: 'harness-kit:harness-qa',
        session: { id: 'QA-DEV-PHASE' },
        phase: Phase.DEVELOPMENT,
      }
    ]

    await handler.handle(Phase.REVIEW, context)

    const tlCall = (context.invokeAgent as any).mock.calls[0][0]
    const qaCall = (context.invokeAgent as any).mock.calls[1][0]

    expect(tlCall.session).toBeUndefined()
    expect(qaCall.session).toBeUndefined()
  })

  it('does NOT reuse review sessions belonging to a different feature', async () => {
    const fsm = makeFsm()
    const specsDir = join(workingDir, 'docs', 'specs', 'sdk_core')

    const context = makeContext(workingDir, fsm, async (inv: any) => {
      if (inv.phaseKey === 'review_tl') {
        const data = { featureId: 'F001', score: 0.95, openPoints: [], architectureTip: '' }
        writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      } else {
        const data = { featureId: 'F001', score: 0.95, passedAdversarial: true, vulnerabilities: [], edgeCasesMissed: [] }
        writeFileSync(join(specsDir, 'QA.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      }
    })
    context.developerSession = [
      {
        featureId: 'F002',
        agent: 'harness-kit:harness-tech-lead',
        session: { id: 'TL-DIFF-FEATURE' },
        phase: Phase.REVIEW,
      },
      {
        featureId: 'F002',
        agent: 'harness-kit:harness-qa',
        session: { id: 'QA-DIFF-FEATURE' },
        phase: Phase.REVIEW,
      }
    ]

    await handler.handle(Phase.REVIEW, context)

    const tlCall = (context.invokeAgent as any).mock.calls[0][0]
    const qaCall = (context.invokeAgent as any).mock.calls[1][0]

    expect(tlCall.session).toBeUndefined()
    expect(qaCall.session).toBeUndefined()
  })
})
