import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { QaDriver } from '../types'
import { QaAgenticOrchestrator } from '../QaAgenticOrchestrator'
import { QaRunStore } from '../services/QaRunStore'
import { HarnessSettings } from '../../settings/HarnessSettings'
import { Runner } from '../../agent-runner/types'

describe('QaAgenticOrchestrator', () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'hrns-agentic-qa-'))
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  it('runs LLM planning, deterministic human-style execution, then LLM reporting', async () => {
    const events: string[] = []
    const progress: string[] = []
    const runner: IAgentRunner = {
      type: Runner.CODEX_CLI,
      run: vi.fn(async (invocation) => {
        events.push(invocation.phaseKey ?? '')
        if (invocation.phaseKey === 'qa_planning') {
          return {
            raw: JSON.stringify({
              id: 'tetris-human-flow',
              target: 'http://127.0.0.1:4173',
              profile: 'web-game',
              criteria: ['Player can start a game', 'Player can control a game'],
              scenarios: [
                {
                  id: 'start-session',
                  criterionIds: ['criterion-1'],
                  required: true,
                  profile: 'web-game',
                  description: 'Start game',
                  actions: [{ type: 'click', selector: '[data-start]' }],
                  assertions: [{ type: 'hidden', selector: '[data-start]' }],
                },
                {
                  id: 'play-session',
                  criterionIds: ['criterion-2'],
                  required: true,
                  profile: 'web-game',
                  description: 'Use player controls',
                  actions: [{ type: 'press', value: 'ArrowLeft' }, { type: 'wait', value: '500' }],
                  assertions: [{ type: 'visible', selector: '[data-board]' }],
                },
              ],
            }),
          }
        }
        if (invocation.phaseKey === 'qa_analysis') return { raw: '{"complete":true}' }
        return {
          raw: JSON.stringify({
            summary: 'Game flow passed.',
            bugs: [],
            errors: [],
          }),
        }
      }),
    }
    const driver: QaDriver = {
      profile: 'web-game',
      doctor: async () => ({ available: true }),
      execute: async (scenario) => {
        events.push('qa_execution')
        return {
          scenarioId: scenario.id,
          required: scenario.required,
          status: 'PASSED',
          evidence: [{ id: 'final-screen', path: 'final.png', capturedAt: '2026-09-11T00:00:00.000Z', adapter: 'playwright' }],
        }
      },
    }
    const store = new QaRunStore(workspace)
    const settings = new (HarnessSettings as any)({ codex: { phases: {} } }) as HarnessSettings
    const orchestrator = new QaAgenticOrchestrator({
      workspace,
      runner,
      store,
      drivers: [driver],
      settings,
      onProgress: (event) => progress.push(`${event.type}:${event.phase ?? event.scenarioId ?? ''}`),
      targetProbe: async () => ({ available: true }),
    })

    const report = await orchestrator.run({
      scope: 'Validate the game as a player',
      scenarios: ['Start a game', 'Move and rotate the active piece'],
    })

    expect(events).toEqual(['qa_planning', 'qa_execution', 'qa_execution', 'qa_analysis', 'qa_reporting'])
    expect(progress).toEqual([
      'phase_started:PLANNING',
      'phase_completed:PLANNING',
      'phase_started:EXECUTION',
      'scenario_started:start-session',
      'scenario_completed:start-session',
      'scenario_started:play-session',
      'scenario_completed:play-session',
      'phase_completed:EXECUTION',
      'phase_started:ANALYSIS',
      'phase_completed:ANALYSIS',
      'phase_started:REPORTING',
      'phase_completed:REPORTING',
    ])
    expect(runner.run).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: 'gpt-5.6-sol',
      effort: 'medium',
      prompt: expect.stringContaining('Move and rotate the active piece'),
    }), expect.anything())
    expect(runner.run).toHaveBeenNthCalledWith(3, expect.objectContaining({
      model: 'gpt-5.6-sol',
      effort: 'low',
    }), expect.anything())
    expect(report).toMatchObject({
      verdict: 'PASS',
      summary: 'Game flow passed.',
      successCriteria: [
        { criterion: 'Player can start a game', status: 'PASSED' },
        { criterion: 'Player can control a game', status: 'PASSED' },
      ],
      bugs: [],
      errors: [],
    })
    expect(store.loadReport(report.runId)).toEqual(report)
  })

  it('rejects a planning response that cannot drive executable QA', async () => {
    const runner: IAgentRunner = { run: vi.fn().mockResolvedValue({ raw: '{"criteria":[]}' }) }
    const orchestrator = new QaAgenticOrchestrator({ workspace, runner, store: new QaRunStore(workspace), drivers: [] })

    await expect(orchestrator.run({ scope: 'Test it' })).rejects.toThrow('Invalid agentic QA plan')
  })

  it('resumes a stored plan through execution, analysis, and reporting without replanning', async () => {
    const phases: string[] = []
    const runner: IAgentRunner = { run: vi.fn(async (invocation) => {
      phases.push(invocation.phaseKey ?? '')
      return invocation.phaseKey === 'qa_analysis'
        ? { raw: '{"complete":true}' }
        : { raw: '{"summary":"Stored plan resumed.","bugs":[],"errors":[]}' }
    }) }
    const driver: QaDriver = { profile: 'api', doctor: async () => ({ available: true }), execute: async (scenario) => ({
      scenarioId: scenario.id, required: true, status: 'PASSED',
      evidence: [{ id: 'response', path: 'response.body', capturedAt: '', adapter: 'test' }],
    }) }
    const plan = {
      schemaVersion: 1 as const, id: 'saved-plan', version: 1, target: 'http://127.0.0.1:3000', profile: 'api' as const,
      createdAt: '', criteria: ['Health works'], scenarios: [{ id: 'health', criterionIds: ['criterion-1'], required: true, profile: 'api' as const }],
    }
    const orchestrator = new QaAgenticOrchestrator({
      workspace, runner, drivers: [driver], model: 'gemini-3.7-flash', targetProbe: async () => ({ available: true }),
    })

    const report = await orchestrator.resume(plan)

    expect(phases).toEqual(['qa_analysis', 'qa_reporting'])
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.7-flash' }), expect.anything())
    expect(report).toMatchObject({ verdict: 'PASS', summary: 'Stored plan resumed.' })
  })

  it('rejects browser plans without executable assertions and unsafe action budgets', async () => {
    const runner: IAgentRunner = { run: vi.fn().mockResolvedValue({ raw: JSON.stringify({
      id: 'unsafe-plan', target: 'http://127.0.0.1:3000', profile: 'web', criteria: ['Form works'],
      scenarios: [{ id: 'form', criterionIds: ['criterion-1'], required: true, profile: 'web',
        actions: [{ type: 'press', key: 'Enter', count: 1001 }] }],
    }) }) }
    const orchestrator = new QaAgenticOrchestrator({ workspace, runner, store: new QaRunStore(workspace), drivers: [] })

    await expect(orchestrator.run({ scope: 'Test form' })).rejects.toThrow('Invalid agentic QA plan')
  })

  it('deduplicates one product root cause and excludes it from execution errors', async () => {
    const runner: IAgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ raw: JSON.stringify({
          id: 'broken-game', target: 'http://127.0.0.1:3000', profile: 'web-game', criteria: ['Starts', 'Moves'],
          scenarios: [
            { id: 'start', criterionIds: ['criterion-1'], required: true, profile: 'web-game', actions: [{ type: 'click', selector: 'button' }], assertions: [{ type: 'hidden', selector: 'button' }] },
            { id: 'move', criterionIds: ['criterion-2'], required: true, profile: 'web-game', actions: [{ type: 'press', key: 'ArrowDown' }], assertions: [{ type: 'visible', selector: '[data-board]' }] },
          ],
        }) })
        .mockResolvedValueOnce({ raw: '{"complete":true}' })
        .mockResolvedValueOnce({ raw: JSON.stringify({
          summary: 'Two scenarios failed.',
          bugs: [
            { scenarioId: 'start', title: 'Timer failed', severity: 'HIGH', expected: 'Starts', actual: 'Browser page error: Illegal invocation', evidence: [] },
            { scenarioId: 'move', title: 'Timer failed again', severity: 'HIGH', expected: 'Moves', actual: 'Browser page error: Illegal invocation', evidence: [] },
          ],
          errors: [{ scenarioId: 'start', message: 'Browser page error: Illegal invocation' }],
        }) }),
    }
    const driver: QaDriver = { profile: 'web-game', doctor: async () => ({ available: true }), execute: async (scenario) => ({
      scenarioId: scenario.id, required: true, status: 'FAILED', reason: 'Browser page error: Illegal invocation',
      evidence: [{ id: `${scenario.id}-screen`, path: `${scenario.id}.png`, capturedAt: '', adapter: 'playwright' }],
    }) }
    const orchestrator = new QaAgenticOrchestrator({ workspace, runner, drivers: [driver], targetProbe: async () => ({ available: true }) })

    const report = await orchestrator.run({ scope: 'Test game' })

    expect(report.bugs).toHaveLength(1)
    expect(report.errors).toEqual([])
  })

  it('normalizes browser actions and zero-padded criterion IDs produced by the planner', async () => {
    const execute = vi.fn(async (scenario) => ({
      scenarioId: scenario.id,
      required: true,
      status: 'PASSED' as const,
      evidence: [{ id: 'screen', path: 'screen.png', capturedAt: '2026-09-11T00:00:00.000Z', adapter: 'playwright' }],
    }))
    const runner: IAgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ raw: JSON.stringify({
          id: 'responsive-tetris',
          target: 'http://127.0.0.1:3000',
          profile: 'web-game',
          criteria: ['Game remains usable on a narrow viewport'],
          scenarios: [{
            id: 'responsive-layout',
            criterionIds: ['criterion-01'],
            required: true,
            profile: 'web-game',
            description: 'Resize, navigate, start, and play.',
            actions: [
              { type: 'resize', width: 320, height: 800 },
              { type: 'navigate', url: 'http://127.0.0.1:3000' },
              { type: 'wait', milliseconds: 300 },
              { type: 'press', key: 'ArrowDown', count: 250 },
            ],
            assertions: [{ type: 'visible', selector: '[data-board]' }],
          }],
        }) })
        .mockResolvedValueOnce({ raw: '{"complete":true}' })
        .mockResolvedValueOnce({ raw: JSON.stringify({ summary: 'Responsive flow passed.', bugs: [], errors: [] }) }),
    }
    const driver: QaDriver = { profile: 'web-game', doctor: async () => ({ available: true }), execute }
    const orchestrator = new QaAgenticOrchestrator({
      workspace, runner, store: new QaRunStore(workspace), drivers: [driver],
      targetProbe: async () => ({ available: true }),
    })

    await expect(orchestrator.run({ scope: 'Test Tetris' })).resolves.toMatchObject({ verdict: 'PASS' })
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      criterionIds: ['criterion-1'],
      actions: [
        { type: 'resize', width: 320, height: 800 },
        { type: 'navigate', value: 'http://127.0.0.1:3000' },
        { type: 'wait', value: '300' },
        { type: 'press', value: 'ArrowDown', count: 250 },
      ],
    }), 'http://127.0.0.1:3000', expect.any(String), undefined)
  })

  it('serves a static project on an OS-assigned port and keeps that target authoritative', async () => {
    writeFileSync(join(workspace, 'index.html'), '<h1>Tetris runtime</h1>')
    writeFileSync(join(workspace, '.env'), 'SECRET=value')
    writeFileSync(join(workspace, 'secret.ts'), 'export const SECRET = 123')
    let runtimeTarget = ''
    const execute = vi.fn(async (scenario, target) => {
      runtimeTarget = target
      const response = await fetch(target)
      expect(await response.text()).toContain('Tetris runtime')
      expect((await fetch(`${target}/.env`)).status).toBe(404)
      expect((await fetch(`${target}/secret.ts`)).status).toBe(403)
      expect(scenario.actions[0].value).toBe(target)
      return {
        scenarioId: scenario.id,
        required: true,
        status: 'PASSED' as const,
        evidence: [{ id: 'screen', path: 'screen.png', capturedAt: '2026-09-11T00:00:00.000Z', adapter: 'playwright' }],
      }
    })
    const runner: IAgentRunner = {
      run: vi.fn(async (invocation) => {
        if (invocation.phaseKey === 'qa_planning') {
          const target = /Target URL hint: (http:\/\/127\.0\.0\.1:\d+)/.exec(invocation.prompt)?.[1]
          expect(target).toBeTruthy()
          expect(target).not.toBe('http://127.0.0.1:3000')
          return { raw: JSON.stringify({
            id: 'static-tetris',
            target: 'http://127.0.0.1:3000',
            profile: 'web-game',
            criteria: ['Tetris loads'],
            scenarios: [{
              id: 'load', criterionIds: ['criterion-1'], required: true, profile: 'web-game',
              actions: [{ type: 'navigate', url: 'http://127.0.0.1:3000' }],
              assertions: [{ type: 'visible', selector: 'h1' }],
            }],
          }) }
        }
        if (invocation.phaseKey === 'qa_analysis') return { raw: '{"complete":true}' }
        return { raw: JSON.stringify({ summary: 'Static game loaded.', bugs: [], errors: [] }) }
      }),
    }
    const driver: QaDriver = { profile: 'web-game', doctor: async () => ({ available: true }), execute }
    const orchestrator = new QaAgenticOrchestrator({ workspace, runner, store: new QaRunStore(workspace), drivers: [driver] })

    await expect(orchestrator.run({ scope: 'Test Tetris' })).resolves.toMatchObject({ verdict: 'PASS' })
    expect(runtimeTarget).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    await expect(fetch(runtimeTarget)).rejects.toThrow()
  })

  it('lets the LLM inspect evidence and add a bounded scenario before reporting', async () => {
    const phases: string[] = []
    const execute = vi.fn(async (scenario) => ({
      scenarioId: scenario.id, required: true, status: 'PASSED' as const,
      evidence: [{ id: `${scenario.id}-evidence`, path: `${scenario.id}.json`, capturedAt: '', adapter: 'playwright' }],
    }))
    const initialPlan = {
      id: 'adaptive-web', target: 'http://127.0.0.1:3000', profile: 'web', criteria: ['Page loads'],
      scenarios: [{ id: 'load', criterionIds: ['criterion-1'], required: true, profile: 'web', category: 'functional',
        actions: [{ type: 'navigate', url: 'http://127.0.0.1:3000' }], assertions: [{ type: 'visible', selector: 'body' }] }],
    }
    const runner: IAgentRunner = { type: Runner.CODEX_CLI, run: vi.fn(async (invocation) => {
      phases.push(invocation.phaseKey ?? '')
      if (invocation.phaseKey === 'qa_planning') return { raw: JSON.stringify(initialPlan) }
      if (invocation.phaseKey === 'qa_analysis') return { raw: JSON.stringify({ complete: false, plan: {
        ...initialPlan,
        criteria: ['Page loads', 'Invalid submission is rejected'],
        scenarios: [...initialPlan.scenarios, {
          id: 'invalid-form', criterionIds: ['criterion-2'], required: true, profile: 'web', category: 'negative',
          actions: [{ type: 'click', selector: '[data-submit]' }], assertions: [{ type: 'visible', selector: '[role=alert]' }],
        }],
      } }) }
      return { raw: JSON.stringify({ summary: 'Coverage complete.', bugs: [], errors: [] }) }
    }) }
    const orchestrator = new QaAgenticOrchestrator({ workspace, runner, drivers: [{ profile: 'web', doctor: async () => ({ available: true }), execute }], targetProbe: async () => ({ available: true }) })

    const report = await orchestrator.run({ scope: 'Test form' })

    expect(phases).toEqual(['qa_planning', 'qa_analysis', 'qa_reporting'])
    expect(execute).toHaveBeenCalledTimes(2)
    expect(report.successCriteria).toHaveLength(2)
  })

  it('reports one infrastructure error when every scenario shares an unavailable target', async () => {
    const runner: IAgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ raw: JSON.stringify({
          id: 'offline-app', target: 'http://127.0.0.1:3000', profile: 'web',
          criteria: ['Page loads', 'Form opens'],
          scenarios: [
            { id: 'load', criterionIds: ['criterion-1'], required: true, profile: 'web', actions: [{ type: 'wait', milliseconds: 1 }], assertions: [{ type: 'visible', selector: 'body' }] },
            { id: 'form', criterionIds: ['criterion-2'], required: true, profile: 'web', actions: [{ type: 'click', selector: 'button' }], assertions: [{ type: 'visible', selector: 'form' }] },
          ],
        }) })
        .mockResolvedValueOnce({ raw: JSON.stringify({
          summary: 'Target unavailable.', bugs: [],
          errors: [
            { scenarioId: 'load', message: 'Target unavailable: connection refused' },
            { scenarioId: 'form', message: 'Target unavailable: connection refused' },
          ],
        }) }),
    }
    const execute = vi.fn()
    const driver: QaDriver = { profile: 'web', doctor: async () => ({ available: true }), execute }
    const orchestrator = new QaAgenticOrchestrator({
      workspace,
      runner,
      store: new QaRunStore(workspace),
      drivers: [driver],
      targetProbe: async () => ({ available: false, reason: 'Target unavailable: connection refused' }),
    })

    const report = await orchestrator.run({ scope: 'Test web app' })

    expect(execute).not.toHaveBeenCalled()
    expect(report.verdict).toBe('BLOCKED')
    expect(report.errors).toEqual([{ message: 'Target unavailable: connection refused' }])
  })

  it('validates bug evidence paths and reconciles summary contradicting verdict', async () => {
    const runner: IAgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ raw: JSON.stringify({
          id: 'test-contradiction', target: 'http://127.0.0.1:3000', profile: 'web',
          criteria: ['Login button is visible'],
          scenarios: [
            { id: 'check-login', criterionIds: ['criterion-1'], required: true, profile: 'web', category: 'functional',
              actions: [{ type: 'click', selector: '#login' }], assertions: [{ type: 'visible', selector: '#login' }] },
          ],
        }) })
        .mockResolvedValueOnce({ raw: JSON.stringify({ complete: true }) })
        .mockResolvedValueOnce({ raw: JSON.stringify({
          summary: 'All checks passed completely and successfully without any issue.',
          bugs: [{
            scenarioId: 'check-login',
            title: 'Button missing',
            severity: 'HIGH',
            expected: 'visible',
            actual: 'hidden',
            evidence: ['non-existent-file.png'],
          }],
          errors: [],
        }) }),
    }
    const driver: QaDriver = {
      profile: 'web',
      doctor: async () => ({ available: true }),
      execute: async (scenario) => ({
        scenarioId: scenario.id,
        required: scenario.required,
        status: 'FAILED',
        reason: 'Button is hidden',
        evidence: [{ id: 'obs', path: 'actual-obs.json', capturedAt: '2026-09-11T00:00:00.000Z', adapter: 'playwright' }],
      }),
    }
    const orchestrator = new QaAgenticOrchestrator({
      workspace,
      runner,
      drivers: [driver],
      targetProbe: async () => ({ available: true }),
    })

    const report = await orchestrator.run({ scope: 'Check login' })

    expect(report.verdict).toBe('FAIL')
    expect(report.bugs).toHaveLength(1)
    expect(report.bugs[0].evidence).toEqual(['actual-obs.json'])
    expect(report.summary).not.toContain('passed completely and successfully')
    expect(report.summary).toContain('FAIL')
  })

  it('computes deterministic coverage matrix reporting tested and untested categories', async () => {
    const runner: IAgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ raw: JSON.stringify({
          id: 'coverage-matrix-test', target: 'http://127.0.0.1:3000', profile: 'web',
          criteria: ['App loads', 'Sql injection blocked'],
          scenarios: [
            { id: 'app-load', criterionIds: ['criterion-1'], required: true, profile: 'web', category: 'functional',
              actions: [{ type: 'wait', milliseconds: 1 }], assertions: [{ type: 'visible', selector: 'body' }] },
            { id: 'sec-check', criterionIds: ['criterion-2'], required: true, profile: 'web', category: 'security',
              actions: [{ type: 'click', selector: 'button' }], assertions: [{ type: 'visible', selector: 'body' }] },
          ],
        }) })
        .mockResolvedValueOnce({ raw: JSON.stringify({ complete: true }) })
        .mockResolvedValueOnce({ raw: JSON.stringify({ summary: 'Run done.', bugs: [], errors: [] }) }),
    }
    const driver: QaDriver = {
      profile: 'web',
      doctor: async () => ({ available: true }),
      execute: async (scenario) => ({
        scenarioId: scenario.id,
        required: scenario.required,
        status: 'PASSED',
        evidence: [{ id: 'ev', path: 'ev.json', capturedAt: '2026-09-11T00:00:00.000Z', adapter: 'playwright' }],
      }),
    }
    const orchestrator = new QaAgenticOrchestrator({
      workspace,
      runner,
      drivers: [driver],
      targetProbe: async () => ({ available: true }),
    })

    const report = await orchestrator.run({ scope: 'Test app' })

    expect(report.coverageMatrix).toBeDefined()
    expect(report.coverageMatrix!.testedCategories).toContain('functional')
    expect(report.coverageMatrix!.testedCategories).toContain('security')
    expect(report.coverageMatrix!.untestedCategories).toContain('accessibility')
    expect(report.coverageMatrix!.untestedCategories).toContain('resilience')
    expect(report.coverageMatrix!.areas.functional.passed).toBe(1)
    expect(report.coverageMatrix!.areas.security.passed).toBe(1)
  })

  it('recovers with deterministic report when LLM reporting phase fails', async () => {
    const runner: IAgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ raw: JSON.stringify({
          id: 'reporting-failure-recovery', target: 'http://127.0.0.1:3000', profile: 'web',
          criteria: ['App loads'],
          scenarios: [
            { id: 'app-load', criterionIds: ['criterion-1'], required: true, profile: 'web', category: 'functional',
              actions: [{ type: 'wait', milliseconds: 1 }], assertions: [{ type: 'visible', selector: 'body' }] },
          ],
        }) })
        .mockResolvedValueOnce({ raw: JSON.stringify({ complete: true }) })
        .mockRejectedValueOnce(new Error('LLM rate limit or connection error')),
    }
    const driver: QaDriver = {
      profile: 'web',
      doctor: async () => ({ available: true }),
      execute: async (scenario) => ({
        scenarioId: scenario.id,
        required: scenario.required,
        status: 'PASSED',
        evidence: [{ id: 'ev', path: 'ev.json', capturedAt: '2026-09-11T00:00:00.000Z', adapter: 'playwright' }],
      }),
    }
    const orchestrator = new QaAgenticOrchestrator({
      workspace,
      runner,
      drivers: [driver],
      targetProbe: async () => ({ available: true }),
    })

    const report = await orchestrator.run({ scope: 'Test app' })

    expect(report).toBeDefined()
    expect(report.verdict).toBe('PASS')
    expect(report.successCriteria).toHaveLength(1)
    expect(report.successCriteria[0].status).toBe('PASSED')
  })
})
