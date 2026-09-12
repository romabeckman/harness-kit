import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmdQa, parseQaArgs } from '../qa-service'
import { QaRunStore } from '../../../qa/services/QaRunStore'
import type { IAgentRunner } from '../../../agent-runner/IAgentRunner'
import type { QaDriver, QaPlan, QaRun } from '../../../qa/types'

const prompts = vi.hoisted(() => ({ editor: vi.fn(), input: vi.fn(), select: vi.fn() }))

vi.mock('@inquirer/prompts', () => prompts)

describe('QA CLI', () => {
  let workspace: string
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    prompts.editor.mockReset()
    prompts.input.mockReset()
    prompts.select.mockReset()
    workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-cli-'))
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    log.mockRestore()
    rmSync(workspace, { recursive: true, force: true })
  })

  it('supports only run and report actions and defaults to run', () => {
    expect(parseQaArgs([])).toMatchObject({ action: 'run' })
    expect(parseQaArgs(['run', '--scope', 'Test endpoint X'])).toMatchObject({ action: 'run', scope: 'Test endpoint X' })
    expect(parseQaArgs(['report', '--run', 'orders-20260911'])).toMatchObject({ action: 'report', runId: 'orders-20260911' })
    for (const legacy of ['agentic', 'plan', 'execute', 'renew', 'resume', 'doctor']) {
      expect(() => parseQaArgs([legacy])).toThrow(`Unknown QA action: ${legacy}`)
    }
  })

  it('prompts for scope when run omits --scope', async () => {
    prompts.select.mockResolvedValue('type')
    prompts.input.mockResolvedValue('Validate the complete checkout flow')
    const runner: IAgentRunner = { run: vi.fn().mockRejectedValue(new Error('stop after prompt')) }

    await expect(cmdQa(workspace, ['run'], { runner })).rejects.toThrow('stop after prompt')

    expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('QA scope') }))
    expect(prompts.input).toHaveBeenCalledWith(expect.objectContaining({ message: 'QA scope:', validate: expect.any(Function) }))
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      phaseKey: 'qa_planning', prompt: expect.stringContaining('Validate the complete checkout flow'),
    }), expect.any(Object))
  })

  it('runs the complete agentic QA flow and renders its report', async () => {
    const runner = agenticRunner()
    const driver: QaDriver = {
      profile: 'api',
      doctor: async () => ({ available: true }),
      execute: async (scenario) => ({
        scenarioId: scenario.id, required: true, status: 'PASSED',
        evidence: [{ id: 'response', path: 'response.body', capturedAt: '', adapter: 'curl' }],
      }),
    }
    const view = { start: vi.fn(), onProgress: vi.fn(), renderReport: vi.fn() }

    await cmdQa(workspace, ['run', '--scope', 'Validate runtime behavior'], {
      runner, drivers: [driver], view, targetProbe: async () => ({ available: true }),
    })

    expect(runner.run).toHaveBeenCalledTimes(3)
    expect(view.start).toHaveBeenCalledWith(expect.objectContaining({ scope: 'Validate runtime behavior' }), workspace)
    expect(view.onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'scenario_completed', status: 'PASSED' }))
    expect(view.renderReport).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'PASS', summary: 'Health check passed.' }))
    expect(log).not.toHaveBeenCalled()
  })

  it('regenerates a report for an explicit completed run', async () => {
    const store = seedCompletedRun(workspace, 'completed-run', '2026-09-11T12:00:00.000Z')
    const runner = reportingRunner('Stored run reported.')

    await cmdQa(workspace, ['report', '--run', 'completed-run'], { runner })

    expect(prompts.select).not.toHaveBeenCalled()
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ phaseKey: 'qa_reporting' }), expect.anything())
    expect(store.loadReport('completed-run')).toMatchObject({ summary: 'Stored run reported.', verdict: 'PASS' })
    expect(readFileSync(store.reportMarkdownPath('completed-run'), 'utf8')).toContain('Stored run reported.')
  })

  it('selects a completed run when report omits --run', async () => {
    seedCompletedRun(workspace, 'older-run', '2026-09-10T12:00:00.000Z')
    const store = seedCompletedRun(workspace, 'orders-20260911', '2026-09-11T12:00:00.000Z')
    prompts.select.mockResolvedValue('orders-20260911')

    await cmdQa(workspace, ['report'], { runner: reportingRunner('Selected run reported.') })

    expect(prompts.select).toHaveBeenCalledWith({
      message: 'Select the QA run to report:',
      choices: [
        expect.objectContaining({ value: 'orders-20260911' }),
        expect.objectContaining({ value: 'older-run' }),
      ],
    })
    expect(store.loadReport('orders-20260911')).toMatchObject({ summary: 'Selected run reported.' })
  })

  it('explains how to create a run when report has nothing to select', async () => {
    await expect(cmdQa(workspace, ['report'], { runner: reportingRunner('unused') }))
      .rejects.toThrow('No completed QA runs available. Run "hrns qa run" first.')
    expect(prompts.select).not.toHaveBeenCalled()
  })
})

function seedCompletedRun(workspace: string, runId: string, completedAt: string): QaRunStore {
  const store = new QaRunStore(workspace)
  const plan = storedPlan()
  try { store.savePlan(plan) } catch { /* shared plan already exists */ }
  const run: QaRun = {
    schemaVersion: 1, id: runId, planId: plan.id, planVersion: plan.version,
    target: plan.target, createdAt: completedAt, completedAt, verdict: 'PASS',
    results: plan.scenarios.map((scenario) => ({
      scenarioId: scenario.id, required: true, status: 'PASSED',
      evidence: [{ id: scenario.id, path: scenario.id, capturedAt: completedAt, adapter: 'test' }],
    })),
  }
  store.saveRun(run)
  return store
}

function storedPlan(): QaPlan {
  return {
    schemaVersion: 1, id: 'stored-plan', version: 1, target: 'http://127.0.0.1:3000',
    profile: 'api', createdAt: '2026-09-11T00:00:00.000Z', criteria: ['Health works'],
    scenarios: [{
      id: '001-health', criterionIds: ['criterion-1'], required: true, profile: 'api', category: 'functional',
      request: { method: 'GET', path: '/health', expectedStatus: 200 },
    }],
  }
}

function reportingRunner(summary: string): IAgentRunner {
  return { run: vi.fn().mockResolvedValue({
    raw: JSON.stringify({ summary, markdown: `# QA Report\n\n${summary}\n`, bugs: [], errors: [] }),
  }) }
}

function agenticRunner(): IAgentRunner {
  return { run: vi.fn(async (invocation) => {
    if (invocation.phaseKey === 'qa_planning') return { raw: JSON.stringify({
      id: 'health-flow', target: 'http://127.0.0.1:3000', profile: 'api', criteria: ['Health works'],
      scenarios: [{
        id: 'health', criterionIds: ['criterion-1'], required: true, profile: 'api', category: 'functional',
        request: { method: 'GET', path: '/health', expectedStatus: 200 },
      }],
    }) }
    if (invocation.phaseKey === 'qa_analysis') return { raw: '{"complete":true}' }
    return { raw: JSON.stringify({ summary: 'Health check passed.', bugs: [], errors: [] }) }
  }) }
}
