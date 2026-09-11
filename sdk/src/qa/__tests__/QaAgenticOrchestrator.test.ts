import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
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
    const orchestrator = new QaAgenticOrchestrator({ workspace, runner, store, drivers: [driver], settings })

    const report = await orchestrator.run({
      scope: 'Validate the game as a player',
      scenarios: ['Start a game', 'Move and rotate the active piece'],
    })

    expect(events).toEqual(['qa_planning', 'qa_execution', 'qa_execution', 'qa_reporting'])
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
})
