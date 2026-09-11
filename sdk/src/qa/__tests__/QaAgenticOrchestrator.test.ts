import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { QaDriver } from '../types'
import { QaAgenticOrchestrator } from '../QaAgenticOrchestrator'
import { QaRunStore } from '../QaRunStore'
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
                },
                {
                  id: 'play-session',
                  criterionIds: ['criterion-2'],
                  required: true,
                  profile: 'web-game',
                  description: 'Use player controls',
                  actions: [{ type: 'press', value: 'ArrowLeft' }, { type: 'wait', value: '500' }],
                },
              ],
            }),
          }
        }
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

    expect(events).toEqual(['qa_planning', 'qa_execution', 'qa_execution', 'qa_reporting'])
    expect(progress).toEqual([
      'phase_started:PLANNING',
      'phase_completed:PLANNING',
      'phase_started:EXECUTION',
      'scenario_started:start-session',
      'scenario_completed:start-session',
      'scenario_started:play-session',
      'scenario_completed:play-session',
      'phase_completed:EXECUTION',
      'phase_started:REPORTING',
      'phase_completed:REPORTING',
    ])
    expect(runner.run).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: 'gpt-5.6-sol',
      effort: 'medium',
      prompt: expect.stringContaining('Move and rotate the active piece'),
    }), expect.anything())
    expect(runner.run).toHaveBeenNthCalledWith(2, expect.objectContaining({
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
          }],
        }) })
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
    let runtimeTarget = ''
    const execute = vi.fn(async (scenario, target) => {
      runtimeTarget = target
      const response = await fetch(target)
      expect(await response.text()).toContain('Tetris runtime')
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
            }],
          }) }
        }
        return { raw: JSON.stringify({ summary: 'Static game loaded.', bugs: [], errors: [] }) }
      }),
    }
    const driver: QaDriver = { profile: 'web-game', doctor: async () => ({ available: true }), execute }
    const orchestrator = new QaAgenticOrchestrator({ workspace, runner, store: new QaRunStore(workspace), drivers: [driver] })

    await expect(orchestrator.run({ scope: 'Test Tetris' })).resolves.toMatchObject({ verdict: 'PASS' })
    expect(runtimeTarget).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    await expect(fetch(runtimeTarget)).rejects.toThrow()
  })

  it('reports one infrastructure error when every scenario shares an unavailable target', async () => {
    const runner: IAgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ raw: JSON.stringify({
          id: 'offline-app', target: 'http://127.0.0.1:3000', profile: 'web',
          criteria: ['Page loads', 'Form opens'],
          scenarios: [
            { id: 'load', criterionIds: ['criterion-1'], required: true, profile: 'web', actions: [{ type: 'wait', milliseconds: 1 }] },
            { id: 'form', criterionIds: ['criterion-2'], required: true, profile: 'web', actions: [{ type: 'click', selector: 'button' }] },
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
})
