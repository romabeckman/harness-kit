import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QaAgenticOrchestrator } from '../QaAgenticOrchestrator'
import { PlaywrightDriver } from '../engine/PlaywrightDriver'
import { QaPlanningPhase } from '../phases/QaPlanningPhase'
import { QaAnalysisPhase } from '../phases/QaAnalysisPhase'
import { QaReportingPhase } from '../phases/QaReportingPhase'
import { QaTerminalView } from '../ui/QaTerminalView'
import { QaRuntimeManager } from '../services/QaRuntimeManager'
import { QaService } from '../services/QaService'
import { QaRunStore } from '../services/QaRunStore'
import type { QaProgressEvent } from '../progress'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import { Runner } from '../../agent-runner/types'
import type { QaDriver, QaScenarioStatus } from '../types'
import type { QaPhaseContext } from '../phases/types'

describe('QA focused regressions', () => {
  let workspace: string
  beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-improvements-')) })
  afterEach(() => { rmSync(workspace, { recursive: true, force: true }) })

  const plan = () => ({
    id: 'target-check', target: 'http://127.0.0.1:8080', profile: 'api', criteria: ['Health responds'],
    scenarios: [{ id: 'health', criterionIds: ['criterion-1'], required: true, profile: 'api',
      request: { method: 'GET', path: '/health', expectedStatus: 200 } }],
  })

  function setup(status: QaScenarioStatus = 'PASSED', analysis: unknown = { complete: true }) {
    const runner: IAgentRunner = { run: vi.fn(async (invocation) => ({ raw: JSON.stringify(
      invocation.phaseKey === 'qa_planning' ? plan() : invocation.phaseKey === 'qa_analysis' ? analysis : {},
    ) })) }
    const driver: QaDriver = { profile: 'api', doctor: async () => ({ available: true }), execute: vi.fn(async (scenario, _target, directory) => {
      mkdirSync(directory, { recursive: true })
      const path = join(directory, 'response.json')
      writeFileSync(path, '{"ready":true}')
      return { scenarioId: scenario.id, required: true, status, observedStatus: status === 'PASSED' ? 200 : undefined,
        reason: status === 'BLOCKED' ? 'Connection refused' : undefined,
        evidence: status === 'PASSED' || status === 'FAILED' ? [{ id: 'response', path, capturedAt: new Date().toISOString(), adapter: 'test' }] : [] }
    }) }
    const events: QaProgressEvent[] = []
    const orchestrator = new QaAgenticOrchestrator({ workspace, runner, drivers: [driver],
      targetProbe: async () => ({ available: true }), onProgress: (event) => events.push(event) })
    return { runner, driver, orchestrator, events }
  }

  it('rejects a planner profile that contradicts the requested engine', () => {
    expect(() => new QaPlanningPhase().parse(JSON.stringify(plan()), { profile: 'web' }, 1)).toThrow('requested profile')
  })

  it('reads Antigravity planning output from the file requested by the prompt', async () => {
    let prompt = ''
    const runner: IAgentRunner = {
      type: Runner.ANTIGRAVITY_CLI,
      run: vi.fn(async (invocation) => {
        prompt = invocation.prompt ?? ''
        const outputPath = /<qa_output_file>([^<]+)<\/qa_output_file>/.exec(prompt)?.[1]
        if (!outputPath) throw new Error('planning output path missing')
        writeFileSync(join(workspace, outputPath), JSON.stringify(plan()))
        return { raw: 'Plan written to file.' }
      }),
    }
    const store = new QaRunStore(workspace)
    const context: QaPhaseContext = {
      workspace,
      request: { scope: 'Check health endpoint', target: 'http://127.0.0.1:8080', profile: 'api' },
      runner,
      store,
      service: new QaService(store, []),
    }

    await expect(new QaPlanningPhase().execute(context)).resolves.toBe('VALIDATION')
    expect(context.plan?.id).toBe('target-check')
    expect(prompt).toContain('Do not return the JSON in your response.')
  })

  it('escapes a raw NUL from invalid planner output before requesting repair', async () => {
    const prompts: string[] = []
    const runner: IAgentRunner = {
      run: vi.fn(async (invocation) => {
        const prompt = invocation.prompt ?? ''
        prompts.push(prompt)
        const outputPath = /<qa_output_file>([^<]+)<\/qa_output_file>/.exec(prompt)?.[1]
        if (!outputPath) throw new Error('planning output path missing')
        const output = prompts.length === 1
          ? JSON.stringify({ ...plan(), probe: 'bad\u0000query' }).replace('\\u0000', '\u0000')
          : JSON.stringify(plan())
        writeFileSync(join(workspace, outputPath), output)
        return { raw: 'Plan written to file.', session: { id: 'qa-planning-session' } }
      }),
    }
    const store = new QaRunStore(workspace)
    const context: QaPhaseContext = {
      workspace,
      request: { scope: 'Check health endpoint', target: 'http://127.0.0.1:8080', profile: 'api' },
      runner,
      store,
      service: new QaService(store, []),
    }

    await expect(new QaPlanningPhase().execute(context)).resolves.toBe('VALIDATION')
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).not.toContain('\u0000')
    expect(prompts[1]).toContain('bad\\u0000query')
    expect(context.plan?.id).toBe('target-check')
  })

  it('reads analysis and reporting output from their requested files', async () => {
    const storedPlan = new QaPlanningPhase().parse(JSON.stringify(plan()), {}, 1)
    const run = {
      schemaVersion: 1 as const,
      id: 'file-output-run',
      planId: storedPlan.id,
      planVersion: storedPlan.version,
      target: storedPlan.target,
      createdAt: '2026-09-12T00:00:00.000Z',
      completedAt: '2026-09-12T00:01:00.000Z',
      verdict: 'PASS' as const,
      results: [{ scenarioId: '001-health', required: true, status: 'PASSED' as const, evidence: [] }],
    }
    const prompts: string[] = []
    const runner: IAgentRunner = {
      run: vi.fn(async (invocation) => {
        const prompt = invocation.prompt ?? ''
        prompts.push(prompt)
        const outputPath = /<qa_output_file>([^<]+)<\/qa_output_file>/.exec(prompt)?.[1]
        if (!outputPath) throw new Error('QA output path missing')
        const output = invocation.phaseKey === 'qa_analysis'
          ? { complete: true }
          : { summary: 'File report.', markdown: '# QA Report\n', bugs: [], errors: [] }
        writeFileSync(join(workspace, outputPath), JSON.stringify(output))
        return { raw: 'Confirmation only.' }
      }),
    }
    const store = new QaRunStore(workspace)
    const context: QaPhaseContext = {
      workspace,
      request: { target: storedPlan.target, profile: storedPlan.profile },
      runner,
      store,
      service: new QaService(store, []),
      plan: storedPlan,
      run,
    }

    await expect(new QaAnalysisPhase().execute(context)).resolves.toBe('REPORTING')
    await expect(new QaReportingPhase().execute(context)).resolves.toBe('COMPLETED')
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain('Generate the QA analysis result directly in this file using file tools.')
    expect(prompts[1]).toContain('Generate the QA report directly in this file using file tools.')
    expect(context.report?.summary).toBe('File report.')
  })

  it('rejects changed executed scenarios during adaptive revision and reports the skipped analysis', async () => {
    const revised = plan()
    revised.scenarios[0].request.path = '/different-endpoint'
    revised.scenarios.push({ ...revised.scenarios[0], id: 'additional' })
    const { orchestrator, driver, events } = setup('PASSED', { complete: false, plan: revised })
    const report = await orchestrator.run({ scope: 'Check health endpoint' })
    expect(report.verdict).toBe('PASS')
    expect(driver.execute).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual(expect.objectContaining({ type: 'phase_warning', phase: 'ANALYSIS', reason: expect.stringContaining('unchanged') }))
  })

  it('warns about malformed analysis instead of silently accepting it as complete', async () => {
    const { orchestrator, events } = setup('PASSED', { complete: false })
    await orchestrator.run({ scope: 'Check health endpoint' })
    expect(events).toContainEqual(expect.objectContaining({ type: 'phase_warning', reason: expect.stringContaining('analysis') }))
  })

  it('includes scenario failure reasons in progress and terminal output', async () => {
    const { orchestrator, events } = setup('BLOCKED')
    await orchestrator.run({ scope: 'Check health endpoint' })
    const event = events.find((item) => item.type === 'scenario_completed')!
    expect(event).toMatchObject({ reason: 'Connection refused' })
    const lines: string[] = []
    new QaTerminalView((line) => lines.push(line), false).onProgress(event)
    expect(lines.join('\n')).toContain('Connection refused')
  })

  it('remembers verified execution targets for later planning without storing results', async () => {
    const { orchestrator, runner } = setup()
    await orchestrator.run({ scope: 'Check health endpoint' })
    const path = join(workspace, 'docs', 'qa', 'execution-memory.json')
    expect(existsSync(path)).toBe(true)
    expect(existsSync(join(workspace, '.harness-kit', 'qa', 'execution-memory.json'))).toBe(false)
    const memory = readFileSync(path, 'utf8')
    expect(memory).toContain('http://127.0.0.1:8080')
    expect(memory).not.toMatch(/PASSED|verdict|response.json|Health responds/)
    await orchestrator.run({ scope: 'Check health endpoint again' })
    const calls = vi.mocked(runner.run).mock.calls.filter(([invocation]) => invocation.phaseKey === 'qa_planning')
    expect(calls[1][0].prompt).toContain('<qa_execution_memory>')
    expect(calls[1][0].prompt).toContain('http://127.0.0.1:8080')
    expect(calls[1][0].prompt).toContain('docs/.digest.md')
  })

  it('does not learn blocked targets', async () => {
    const { orchestrator } = setup('BLOCKED')
    await orchestrator.run({ scope: 'Check health endpoint' })
    expect(existsSync(join(workspace, 'docs', 'qa', 'execution-memory.json'))).toBe(false)
  })

  it('keeps an explicit target authoritative over remembered ports', async () => {
    const { orchestrator, runner } = setup()
    await orchestrator.run({ scope: 'Check health endpoint' })
    await orchestrator.run({ scope: 'Check another environment', target: 'http://127.0.0.1:8081' })
    const planningCalls = vi.mocked(runner.run).mock.calls.filter(([invocation]) => invocation.phaseKey === 'qa_planning')
    expect(planningCalls[1][0].prompt).toContain('Target URL hint: http://127.0.0.1:8081')
    const hints = readFileSync(join(workspace, 'docs', 'qa', 'execution-memory.json'), 'utf8')
    expect(hints).toContain('8081')
    expect(hints).not.toContain('8080')
  })

  it('does not start a static web server for an explicit CLI profile', async () => {
    writeFileSync(join(workspace, 'index.html'), '<html></html>')
    const runtime = await new QaRuntimeManager(workspace).prepare({ profile: 'cli' })
    try { expect(runtime).toBeUndefined() } finally { await runtime?.stop() }
  })

  it('routes security HTTP scenarios through the API driver', async () => {
    const { driver } = setup()
    const service = new QaService(new QaRunStore(workspace), [driver], async () => ({ available: true }))
    expect(await service.doctor('security')).toEqual({ available: true })
    const generated = new QaPlanningPhase().parse(JSON.stringify({ ...plan(), profile: 'security',
      scenarios: plan().scenarios.map((scenario) => ({ ...scenario, profile: 'security' })),
    }), {}, 1)
    const run = await service.execute(generated)
    expect(run.results[0].status).toBe('PASSED')
    expect(driver.execute).toHaveBeenCalledTimes(1)
  })

  it('propagates cancellation during reporting without saving a successful fallback', async () => {
    const controller = new AbortController()
    const runner: IAgentRunner = { run: vi.fn(async () => {
      controller.abort(new Error('Cancelled while reporting'))
      throw controller.signal.reason
    }) }
    const stored = new QaPlanningPhase().parse(JSON.stringify(plan()), {}, 1)
    const run = { schemaVersion: 1 as const, id: 'cancelled-report', planId: stored.id, planVersion: stored.version,
      target: stored.target, createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), verdict: 'PASS' as const, results: [] }
    await expect(new QaAgenticOrchestrator({ workspace, runner }).report(stored, run, controller.signal)).rejects.toThrow('Cancelled while reporting')
    expect(existsSync(new QaRunStore(workspace).reportPath(run.id))).toBe(false)
  })

  it('ignores corrupt and expired execution memory', async () => {
    const directory = join(workspace, 'docs', 'qa')
    mkdirSync(directory, { recursive: true })
    for (const raw of ['broken json', JSON.stringify({ schemaVersion: 1, targets: [{ profile: 'api', target: 'http://127.0.0.1:9999', verifiedAt: '2000-01-01T00:00:00.000Z' }] })]) {
      writeFileSync(join(directory, 'execution-memory.json'), raw)
      const { orchestrator, runner } = setup('BLOCKED')
      await orchestrator.run({ scope: 'Check health endpoint' })
      expect(vi.mocked(runner.run).mock.calls[0][0].prompt).not.toContain('9999')
    }
  })

  it('does not learn managed temporary ports or sensitive target URLs', async () => {
    for (const target of ['http://127.0.0.1:8080/?token=private', 'http://127.0.0.1:8080']) {
      const { runner, driver } = setup()
      const orchestrator = new QaAgenticOrchestrator({ workspace, runner, drivers: [driver],
        runtime: { prepare: async () => ({ target, managed: !target.includes('?'), stop: async () => undefined }) },
        targetProbe: async () => ({ available: true }) })
      await orchestrator.run({ scope: 'Check health endpoint' })
      expect(existsSync(join(workspace, 'docs', 'qa', 'execution-memory.json'))).toBe(false)
    }
  })

  it('never creates empty screenshots to claim verified evidence', async () => {
    const driver = new PlaywrightDriver('web', async () => ({ chromium: { launch: async () => ({
      newPage: async () => ({ goto: async () => undefined, locator: () => ({ isVisible: async () => true }), screenshot: async () => undefined }),
      close: async () => undefined,
    }) } }))
    const result = await driver.execute({ id: 'screen', criterionIds: ['criterion-1'], required: true, profile: 'web',
      assertions: [{ type: 'visible', selector: '#ready' }] }, 'http://127.0.0.1:8080', workspace)
    expect(result.status).toBe('INCONCLUSIVE')
    expect(existsSync(join(workspace, 'final.png'))).toBe(false)
  })
})
