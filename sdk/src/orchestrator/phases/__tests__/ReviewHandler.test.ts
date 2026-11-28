import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { DebugContext } from '../../../cli/DebugContext'
import { ReviewHandler } from '../ReviewHandler'
import { DreamingEpisodeStore } from '../../../file-state/DreamingEpisodeStore'
import type { TddOutput } from '../../utils/PhaseFileUtils'
import { Complexity, Phase } from '../../types'
import type { Reviewontext } from '../AbstractPhaseHandler'
import type { IFileStateManager } from '../../../file-state/FileStateManager'
import type { Feature, BootstrapConfig, Task } from '../../../file-state/types'
import { AgentRunnerError, AgentRunnerErrorCode } from '../../../agent-runner/AgentRunnerError'

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
    saveBootstrapConfig: vi.fn(),
    updateTaskStatus: vi.fn(),
    appendDecision: vi.fn(),
    updateFeatureStatus: vi.fn(),
    updateAllFeatureTasks: vi.fn(),
    incrementReworks: vi.fn(),
    writeReworkLog: vi.fn(),
    existScope: vi.fn().mockReturnValue(true),
    loadScope: vi.fn().mockReturnValue('test'),
    existRefinement: vi.fn().mockReturnValue(false),
    loadRefinement: vi.fn().mockReturnValue(''),
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
    writeFileSync(join(workingDir, 'docs/specs/sdk_core/TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0 }, modifiedFiles: [], reworksCount: 0 }))
  })

  afterEach(() => DebugContext.reset())

  it.each([true, false])('preserves fresh review reports only when debug is %s', async debug => {
    if (debug) DebugContext.enable()
    const specs = join(workingDir, 'docs', 'specs', 'sdk_core')
    const reports = { TL: '{ "score": 0.95, "attempt": 1 }\n', QA: '{ "score": 0.96, "attempt": 1 }\n' }
    const context = makeContext(workingDir, makeFsm(), async inv => {
      const kind = inv.phaseKey === 'review_tl' ? 'TL' : 'QA'
      writeFileSync(join(specs, `${kind}.json`), reports[kind])
      return { success: true, raw: reports[kind] }
    })
    await handler.handle(Phase.REVIEW, context)
    await handler.handle(Phase.REVIEW, context)
    const directory = join(specs, '.debug')
    expect(existsSync(directory)).toBe(debug)
    if (debug) {
      const files = readdirSync(directory)
      expect(files).toHaveLength(4)
      for (const kind of ['TL', 'QA'] as const) {
        const copies = files.filter(file => new RegExp(`^${kind}-\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z-[\\da-f-]{36}\\.json$`).test(file))
        expect(copies).toHaveLength(2)
        for (const file of copies) expect(readFileSync(join(directory, file), 'utf8')).toBe(reports[kind])
      }
    }
  })

  it('preserves a report even if the other reviewer fails', async () => {
    DebugContext.enable()
    const specs = join(workingDir, 'docs', 'specs', 'sdk_core')
    const context = makeContext(workingDir, makeFsm(), async inv => {
      if (inv.phaseKey === 'review_tl') {
        writeFileSync(join(specs, 'TL.json'), 'partial report')
        return { success: true, raw: '{}' }
      }
      throw new Error('review failed')
    })
    await handler.handle(Phase.REVIEW, context).catch(() => undefined)
    const files = readdirSync(join(specs, '.debug'))
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^TL-.*\.json$/)
    expect(readFileSync(join(specs, '.debug', files[0]), 'utf8')).toBe('partial report')
  })

  it('accepts independent approval even when a legacy TDD output reported failure', async () => {
    const path = join(workingDir, 'docs/specs/sdk_core/TDD-OUTPUT.json')
    writeFileSync(path, JSON.stringify({ featureId: 'F001', status: 'FAILED', metrics: { totalTests: 46, passed: 46, failed: 0, coverage: 0 }, modifiedFiles: [], reworksCount: 0, developerHandoff: 'T04 needs refinement' }))
    const fsm = makeFsm()
    const context = makeContext(workingDir, fsm, async () => ({ raw: JSON.stringify({ score: 0.95 }) }))
    expect(await handler.handle(Phase.REVIEW, context)).toBe(Phase.TRANSITION)
    for (const [invocation] of vi.mocked(context.invokeAgent).mock.calls) {
      expect(invocation.prompt).not.toMatch(/Status: FAILED|TDD-OUTPUT\.json|TDD output requires review and correction/)
    }
    expect(fsm.writeReworkLog).not.toHaveBeenCalled()
    expect(fsm.updateAllFeatureTasks).toHaveBeenCalledWith('F001', '-', 'COMPLETED')
  })
  it.each(['missing', 'malformed', 'wrong feature', 'failed tests', 'counts', 'handoff', 'refinement'])('allows independent review with %s TDD output', async kind => {
    const path = join(workingDir, 'docs/specs/sdk_core/TDD-OUTPUT.json')
    const report: any = { featureId: 'F001', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0 }, modifiedFiles: [], reworksCount: 0 }
    if (kind === 'wrong feature') report.featureId = 'F999'
    if (kind === 'failed tests') report.metrics.failed = 1
    if (kind === 'counts') report.metrics.passed = 0
    if (kind === 'handoff') report.developerHandoff = 'x'.repeat(501)
    if (kind === 'refinement') {
      delete report.developerHandoff
      report.orientation_use = [
        { orientation_id: 'rule', revision: 1, feature: 'feature:test', project: 'sdk', decision: 'needs_refinement', reason: 'Choose the recovery policy', test_ref: 'SC-01' },
        { orientation_id: 'covered-rule', revision: 1, feature: 'feature:test', decision: 'covered', reason: 'Already tested' },
      ]
    }
    if (kind === 'missing') { const { unlinkSync } = await import('node:fs'); unlinkSync(path) }
    else writeFileSync(path, kind === 'malformed' ? '{' : JSON.stringify(report))
    const fsm = makeFsm()
    const context = makeContext(workingDir, fsm, async () => ({ raw: JSON.stringify({ score: 0.95 }) }))
    expect(await handler.handle(Phase.REVIEW, context)).toBe(Phase.TRANSITION)
    expect(context.invokeAgent).toHaveBeenCalledTimes(2)
    if (kind === 'refinement') {
      for (const [invocation] of vi.mocked(context.invokeAgent).mock.calls) {
        expect(invocation.prompt).toContain('Determine the appropriate action for each entry')
        expect(invocation.prompt).toContain('needs_refinement')
        expect(invocation.prompt).toContain('Choose the recovery policy')
        expect(invocation.prompt).toContain('SC-01')
        expect(invocation.prompt).not.toContain('covered-rule')
      }
    }
    if (kind === 'missing' || kind === 'malformed') {
      for (const [invocation] of vi.mocked(context.invokeAgent).mock.calls) {
        expect(invocation.prompt).toContain(kind === 'missing' ? 'TDD-OUTPUT.json was not generated' : 'TDD-OUTPUT.json could not be read')
      }
    }
    expect(fsm.writeReworkLog).not.toHaveBeenCalled()
    expect(fsm.updateAllFeatureTasks).toHaveBeenCalledWith('F001', '-', 'COMPLETED')
  })

  it('delegates when phase is not REVIEW', async () => {
    const fsm = makeFsm()
    const context = makeContext(workingDir, fsm)
    const result = await handler.handle(Phase.PLANNING, context)
    expect(result).toBeNull()
  })

  it('returns to development when reviewers find issues and no handoff exists', async () => {
    const { unlinkSync } = await import('node:fs')
    unlinkSync(join(workingDir, 'docs/specs/sdk_core/TDD-OUTPUT.json'))
    const fsm = makeFsm()
    const context = makeContext(workingDir, fsm, async () => ({ raw: JSON.stringify({ score: 0.1, openPoints: ['Fix the failing scenario'] }) }))

    await expect(handler.handle(Phase.REVIEW, context)).resolves.toBe(Phase.DEVELOPMENT)
    expect(fsm.writeReworkLog).toHaveBeenCalledWith('sdk_core', expect.stringContaining('Fix the failing scenario'))
  })

  it.each([
    ['trigger_met', 0.95, true],
    ['guidance_contradicted', 0.95, true],
    ['new_evidence', 0.95, true],
    [undefined, 0.95, true],
    ['trigger_met', 0.5, false],
    ['new_evidence', 0.5, false],
  ] as const)('routes %s after a review scoring %s', async (reason, score, expectedCall) => {
    const feature = makeFeature()
    const roots = ['server', 'web']
    const store = new DreamingEpisodeStore(workingDir, join(workingDir, 'docs/product'))
    const output: TddOutput = {
      featureId: feature.id, reworksCount: 0, modifiedFiles: [],
      metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 },
    }
    for (const root of roots) mkdirSync(join(workingDir, root))
    const finding = { project: 'web', path: 'retry.test.ts', locator: 'preserves identity', summary: reason === 'new_evidence' ? 'A retry test exposed duplicate trace creation before review.' : 'retry-identity trigger matched', review_reason: reason }
    writeFileSync(join(workingDir, 'web', finding.path), finding.locator)
    writeFileSync(join(workingDir, 'docs/specs/sdk_core/TDD-OUTPUT.json'), JSON.stringify(output))
    store.recordDevelopment(feature, output, roots.map(project => ({
      featureId: feature.id, domain: feature.domain, taskId: project, project,
      description: 'Verify retries', status: 'IN_PROGRESS', currentPhase: 'IMPLEMENTATION',
    })), roots)
    const fsm = makeFsm(feature)
    const context = makeContext(workingDir, fsm, async inv => {
      if (inv.skill === 'harness-kit:project-dreaming') return { success: false, raw: 'Unavailable' }
      return { raw: JSON.stringify({ score, learning_evidence: [finding] }) }
    }, { projectPaths: roots })
    const phase = await handler.handle(Phase.REVIEW, { ...context, dreaming: store })
    const calls = vi.mocked(context.invokeAgent).mock.calls.filter(([inv]) => inv.skill === 'harness-kit:project-dreaming')
    expect(calls).toHaveLength(expectedCall ? 2 : 0)
    if (expectedCall) {
      const web = calls.map(([inv]) => JSON.parse(inv.prompt!.split('\n').at(-1)!)).find(item => item.project === join(workingDir, 'web'))
      expect(web.attempts[0].projects[0].findings).toEqual([expect.objectContaining(reason ? { review_reason: reason } : { locator: 'preserves identity' })])
      expect(calls[0][0].prompt).toContain('Explicitly invoke harness-kit:project-dreaming')
      expect(phase).toBe(Phase.TRANSITION)
      expect(fsm.appendDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: expect.stringContaining('Retry Project Dreaming') }))
    }
  })

  it('reviews retry evidence after a clean PASS and verifies the candidate in its owner', async () => {
    const feature = makeFeature()
    const root = join(workingDir, 'server')
    mkdirSync(root)
    writeFileSync(join(root, 'recovery.test.ts'), 'retains identity after restart')
    const task: Task = { featureId: feature.id, domain: feature.domain, taskId: 'T01', project: 'server', description: 'Recovery', status: 'IN_PROGRESS', currentPhase: 'IMPLEMENTATION' }
    const output: TddOutput = { featureId: feature.id, reworksCount: 0, modifiedFiles: ['recovery.test.ts'], metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 } }
    const store = new DreamingEpisodeStore(workingDir, join(workingDir, 'docs/product'))
    store.recordDevelopment(feature, output, [task], ['server'], 'development-session')
    store.recordReview(feature, output, 'RETRY', [], [{ project: 'server', path: 'recovery.test.ts', locator: 'retains identity after restart', summary: 'Recovery after restart' }])
    const retry = store.list()[0]
    const accepted = { ...feature, reworks: 1 }
    const acceptedOutput = { ...output, reworksCount: 1 }
    store.recordDevelopment(accepted, acceptedOutput, [task], ['server'], 'development-session')
    writeFileSync(join(workingDir, 'docs/specs/sdk_core/TDD-OUTPUT.json'), JSON.stringify(acceptedOutput))
    const context = makeContext(workingDir, makeFsm(accepted), async invocation => {
      if (invocation.skill !== 'harness-kit:project-dreaming') return { raw: JSON.stringify({ score: 0.95 }) }
      const data = JSON.parse(invocation.prompt!.split('\n').at(-1)!)
      expect(data.attempts.map((item: { id: string }) => item.id)).toEqual([retry.id, data.episode_id])
      expect(data.attempts[0].projects[0].findings[0].locator).toBe('retains identity after restart')
      const folder = join(root, 'docs/harness-history/learning/active')
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, 'restart-identity.md'), `---\nid: restart-identity\nfeature_node_id: "feature:recovery"\napplies_when: recovery changes\nproposed_action: test restart\nskip_when: equivalent coverage exists\nprediction: finds lost identity\nrefutation: baseline finds it\nreview_trigger: next recovery change\n---\n## Origin evidence\n${retry.id}\n`)
      return { raw: JSON.stringify({ episode_id: data.episode_id, project: root, feature: 'feature:recovery', inspected_episode_ids: [retry.id, data.episode_id], status: 'recorded', evidence_refs: ['recovery.test.ts#retains identity after restart'], hypotheses: [{ id: 'restart-identity', disposition: 'created', origin_episode_ids: [retry.id] }] }) }
    }, { projectPaths: ['server'] })
    vi.mocked(context.getActiveFeature).mockReturnValue(accepted)
    expect(await handler.handle(Phase.REVIEW, { ...context, dreaming: store })).toBe(Phase.TRANSITION)
    const terminal = store.list().find(item => item.reworks === 1)!
    expect(terminal.projects[0].analysis?.receipt).toMatchObject({ status: 'recorded', hypotheses: [{ id: 'restart-identity', origin_episode_ids: [retry.id] }] })
    expect(readFileSync(join(root, 'docs/harness-history/learning/active/restart-identity.md'), 'utf8')).toContain(retry.id)
  })

  it('extracts a first-pass test decision when reviewers provide no learning evidence', async () => {
    const feature = makeFeature()
    const root = join(workingDir, 'server')
    mkdirSync(root)
    writeFileSync(join(root, 'recovery.test.ts'), 'preserves identity in the same service instance')
    const task: Task = { featureId: feature.id, domain: feature.domain, taskId: 'T01', project: 'server', description: 'Recovery', status: 'IN_PROGRESS', currentPhase: 'IMPLEMENTATION' }
    const output: TddOutput = { featureId: feature.id, reworksCount: 0, modifiedFiles: ['recovery.test.ts'], metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 } }
    const store = new DreamingEpisodeStore(workingDir, join(workingDir, 'docs/product'))
    store.recordDevelopment(feature, output, [task], ['server'], 'development-session')
    writeFileSync(join(workingDir, 'docs/specs/sdk_core/TDD-OUTPUT.json'), JSON.stringify(output))
    const context = makeContext(workingDir, makeFsm(feature), async invocation => {
      if (invocation.skill !== 'harness-kit:project-dreaming') return { raw: JSON.stringify({ score: 0.95 }) }
      const data = JSON.parse(invocation.prompt!.split('\n').at(-1)!)
      expect(data.attempts[0].projects[0].sources).toEqual(['recovery.test.ts'])
      const folder = join(root, 'docs/harness-history/learning/active')
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, 'restart-identity.md'), `---\nid: restart-identity\nfeature_node_id: "feature:recovery"\napplies_when: recovery changes\nproposed_action: test persisted recovery after restart\nskip_when: equivalent coverage exists\nprediction: finds lost identity\nrefutation: baseline finds it\nreview_trigger: next recovery change\n---\n## Origin evidence\n${data.episode_id}\n`)
      return { raw: JSON.stringify({ episode_id: data.episode_id, project: root, feature: 'feature:recovery', inspected_episode_ids: [data.episode_id], status: 'recorded', evidence_refs: ['recovery.test.ts#recovery'], hypotheses: [{ id: 'restart-identity', disposition: 'created', origin_episode_ids: [data.episode_id] }] }) }
    }, { projectPaths: ['server'] })
    vi.mocked(context.getActiveFeature).mockReturnValue(feature)
    expect(await handler.handle(Phase.REVIEW, { ...context, dreaming: store })).toBe(Phase.TRANSITION)
    expect(store.list()[0].projects[0].analysis?.receipt).toMatchObject({ status: 'recorded', hypotheses: [{ id: 'restart-identity' }] })
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
    expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F001', 'COMPLETED')
    expect(fsm.appendDecision).toHaveBeenCalledWith(expect.objectContaining({
      featureId: 'F001',
      decision: expect.stringContaining('REVIEW skipped'),
    }))
  })

  it('invokes Tech Lead and Adversarial QA without passing developerSession', async () => {
    const fsm = makeFsm()
    const specsDir = join(workingDir, 'docs', 'specs', 'sdk_core')
    writeFileSync(join(specsDir, 'TDD-OUTPUT.json'), JSON.stringify({
      featureId: 'F001',
      status: 'SUCCESS',
      metrics: { totalTests: 2, passed: 2, failed: 0, coverage: 1 },
      modifiedFiles: ['src/example.ts'],
      developerHandoff: 'Implemented retry handling. Review concurrency cleanup.',
      reworksCount: 0,
    }))

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
    expect(tlCall.prompt).toContain('<development_handoff>')
    expect(qaCall.prompt).toContain('<development_handoff>')
    expect(tlCall.prompt).toContain('Implemented retry handling. Review concurrency cleanup.')
    expect(qaCall.prompt).toContain('Implemented retry handling. Review concurrency cleanup.')
    expect(tlCall.prompt).toContain('navigation context only')
    expect(qaCall.prompt).toContain('navigation context only')
    expect(tlCall.prompt).toContain('<tdd_summary>')
    expect(qaCall.prompt).toContain('<tdd_summary>')
    expect(tlCall.prompt).not.toContain('Status: SUCCESS')
    expect(qaCall.prompt).not.toContain('Status: SUCCESS')
    expect(tlCall.prompt).toContain('Tests: 2 total, 2 passed, 0 failed')
    expect(tlCall.prompt).toContain('Modified files: src/example.ts')
    expect(tlCall.prompt).toContain('<specification_provenance>')
    expect(qaCall.prompt).toContain('<specification_provenance>')
    expect(tlCall.prompt).not.toContain('Read `developerNotes`')
    expect(qaCall.prompt).not.toContain('Read `developerNotes`')
  })

  it.each(['review_tl', 'review_adv'])('blocks the feature when %s is refused and lets the other review settle', async blockedPhase => {
    const fsm = makeFsm()
    const context = makeContext(workingDir, fsm, async inv => {
      if (inv.phaseKey === blockedPhase) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.SAFETY_POLICY_BLOCKED,
          skill: inv.skill,
          phase: 'dispatch',
          message: 'Provider blocked this request.',
        })
      }
      await new Promise<void>(resolve => setImmediate(resolve))
      writeFileSync(join(workingDir, 'docs', 'specs', 'sdk_core', 'other-review-finished'), '')
      return { success: true, raw: '{"score":1}' }
    })
    const warning = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    try {
      await expect(handler.handle(Phase.REVIEW, context)).resolves.toBe(Phase.TRANSITION)

      expect(context.invokeAgent).toHaveBeenCalledTimes(2)
      expect(existsSync(join(workingDir, 'docs', 'specs', 'sdk_core', 'other-review-finished'))).toBe(true)
      expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F001', 'FAILED')
      expect(fsm.updateAllFeatureTasks).toHaveBeenCalledWith('F001', '-', 'FAILED')
      expect(fsm.saveBootstrapConfig).toHaveBeenCalledWith(expect.objectContaining({
        reviewPolicyBlockedFeatures: ['F001'],
      }))
      expect(fsm.appendDecision).toHaveBeenCalledWith(expect.objectContaining({
        featureId: 'F001',
        decision: expect.stringContaining('cybersecurity safeguards'),
      }))
      expect(warning).toHaveBeenCalledWith(expect.stringMatching(
        /X \[phase_review\] F001 marked FAILED[^\n]*\n  .*SAFETY_POLICY_BLOCKED.*\n  Manual review required.*next pending feature/
      ))
      expect(fsm.incrementReworks).not.toHaveBeenCalled()
    } finally {
      warning.mockRestore()
    }
  })

  it('propagates unrelated review errors', async () => {
    const fsm = makeFsm()
    const error = new AgentRunnerError({
      code: AgentRunnerErrorCode.API_ERROR,
      skill: 'review',
      phase: 'dispatch',
      message: 'Service unavailable',
    })
    const context = makeContext(workingDir, fsm, async () => { throw error })

    await expect(handler.handle(Phase.REVIEW, context)).rejects.toBe(error)
    expect(fsm.updateFeatureStatus).not.toHaveBeenCalled()
  })

  it('keeps a prior provider block when validation is skipped', async () => {
    const fsm = makeFsm(makeFeature(), makeConfig({ reviewPolicyBlockedFeatures: ['F001'] }))
    const context = makeContext(workingDir, fsm, undefined, { skipValidation: true })

    await expect(handler.handle(Phase.REVIEW, context)).resolves.toBe(Phase.TRANSITION)
    expect(context.invokeAgent).not.toHaveBeenCalled()
    expect(fsm.updateFeatureStatus).toHaveBeenCalledWith('F001', 'FAILED')
  })

  it('invokes Tech Lead and Adversarial QA when complexity is LOW', async () => {
    const fsm = makeFsm()
    const specsDir = join(workingDir, 'docs', 'specs', 'sdk_core')
    const context = makeContext(workingDir, fsm, async (inv: any) => {
      if (inv.phaseKey === 'review_tl') {
        const data = { featureId: 'F001', score: 0.95, openPoints: [], architectureTip: '' }
        writeFileSync(join(specsDir, 'TL.json'), JSON.stringify(data))
        return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
      }

      const data = { featureId: 'F001', score: 0.95, passedAdversarial: true, vulnerabilities: [], edgeCasesMissed: [] }
      writeFileSync(join(specsDir, 'QA.json'), JSON.stringify(data))
      return { success: true, stdout: '', stderr: '', raw: JSON.stringify(data) }
    }, { complexity: Complexity.LOW })

    await handler.handle(Phase.REVIEW, context)

    expect(context.invokeAgent).toHaveBeenCalledTimes(2)
    expect(context.invokeAgent).toHaveBeenCalledWith(expect.objectContaining({ phaseKey: 'review_tl' }))
    expect(context.invokeAgent).toHaveBeenCalledWith(expect.objectContaining({ phaseKey: 'review_adv' }))
  })

  it('uses REFINEMENT.md content as the exclusive review scope when it exists', async () => {
    const fsm = makeFsm() as any
    fsm.existRefinement.mockReturnValue(true)
    fsm.loadRefinement.mockReturnValue('# Refined review context')
    const context = makeContext(workingDir, fsm, undefined, { scope: 'scope content must not be used' })

    await handler.handle(Phase.REVIEW, context)

    const prompts = (context.invokeAgent as any).mock.calls.map((call: any[]) => call[0].prompt as string)
    expect(prompts).toHaveLength(2)
    for (const prompt of prompts) {
      expect(prompt).toContain('# Refined review context')
      expect(prompt).not.toContain('scope content must not be used')
    }
    expect(fsm.loadScope).not.toHaveBeenCalled()
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
    const fsm = makeFsm(makeFeature(), makeConfig({ reviewPolicyBlockedFeatures: ['F001', 'F002'] }))
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
    expect(fsm.saveBootstrapConfig).toHaveBeenCalledWith(expect.objectContaining({
      reviewPolicyBlockedFeatures: ['F002'],
    }))
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
