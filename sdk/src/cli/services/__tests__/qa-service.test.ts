import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmdQa, parseQaArgs } from '../qa-service'
import { QaRunStore } from '../../../qa/services/QaRunStore'
import type { IAgentRunner } from '../../../agent-runner/IAgentRunner'
import type { QaDriver } from '../../../qa/types'
import type { QaTerminalView } from '../../../qa/ui/QaTerminalView'
import { DebugContext } from '../../DebugContext'
import type { QaPlan } from '../../../qa/types'

const prompts = vi.hoisted(() => ({
  editor: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => prompts)

describe('QA CLI', () => {
  let workspace: string
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    DebugContext.reset()
    prompts.editor.mockReset()
    prompts.input.mockReset()
    prompts.select.mockReset()
    workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-cli-'))
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    DebugContext.reset()
    log.mockRestore()
    rmSync(workspace, { recursive: true, force: true })
  })

  it('parses plan options without an agent runner', () => {
    expect(parseQaArgs(['plan', '--plan', 'orders', '--target', 'http://localhost:3000', '--criterion', 'Order saves'])).toMatchObject({
      action: 'plan', planId: 'orders', target: 'http://localhost:3000', criteria: ['Order saves'],
    })
  })

  it('accepts an open QA scope or repeated detailed scenarios', () => {
    expect(parseQaArgs(['--scope', 'Test endpoint X', '--scenario', 'Valid request returns 200', '--scenario', 'Invalid token returns 401'])).toMatchObject({
      action: 'agentic',
      scope: 'Test endpoint X',
      scenarios: ['Valid request returns 200', 'Invalid token returns 401'],
    })
  })

  it('parses --debug without consuming the next option', () => {
    expect(parseQaArgs(['--debug', '--scope', 'Test endpoint X'])).toMatchObject({
      action: 'agentic',
      debug: true,
      scope: 'Test endpoint X',
    })
  })

  it('prompts for a short scope when agentic QA omits --scope', async () => {
    prompts.select.mockResolvedValue('type')
    prompts.input.mockResolvedValue('Validate the complete checkout flow')

    const runner: IAgentRunner = { run: vi.fn().mockRejectedValue(new Error('stop after prompt')) }

    await expect(cmdQa(workspace, [], { runner })).rejects.toThrow('stop after prompt')

    expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('QA scope'),
    }))
    expect(prompts.input).toHaveBeenCalledWith(expect.objectContaining({
      message: 'QA scope:',
      validate: expect.any(Function),
    }))
    expect(prompts.editor).not.toHaveBeenCalled()
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Validate the complete checkout flow'),
    }), expect.any(Object))
  })

  it('prompts with an editor for a long scope when agentic QA omits --scope', async () => {
    prompts.select.mockResolvedValue('editor')
    prompts.editor.mockResolvedValue('Validate checkout, payment, inventory, and confirmation behavior')

    const runner: IAgentRunner = { run: vi.fn().mockRejectedValue(new Error('stop after prompt')) }

    await expect(cmdQa(workspace, [], { runner })).rejects.toThrow('stop after prompt')

    expect(prompts.editor).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('QA scope'),
      validate: expect.any(Function),
    }))
    expect(prompts.input).not.toHaveBeenCalled()
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Validate checkout, payment, inventory, and confirmation behavior'),
    }), expect.any(Object))
  })

  it('offers resume and renew when a valid stored plan exists', async () => {
    new QaRunStore(workspace).savePlan(storedPlan())
    prompts.select.mockResolvedValueOnce('resume').mockResolvedValueOnce('stored-plan@1')
    const execute = vi.fn(async (scenario) => ({
      scenarioId: scenario.id, required: true, status: 'PASSED' as const,
      evidence: [{ id: scenario.id, path: scenario.id, capturedAt: '', adapter: 'test' }],
    }))

    const runner: IAgentRunner = { run: vi.fn()
      .mockResolvedValueOnce({ raw: '{"complete":true}' })
      .mockResolvedValueOnce({ raw: '{"summary":"Saved plan resumed.","bugs":[],"errors":[]}' }) }
    const view = { start: vi.fn(), onProgress: vi.fn(), renderReport: vi.fn() }

    await cmdQa(workspace, ['--model', 'gemini-3.7-flash'], {
      runner,
      drivers: [{ profile: 'api', doctor: async () => ({ available: true }), execute }],
      targetProbe: async () => ({ available: true }),
      view,
    })

    expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({
      message: 'A saved QA plan exists. What would you like to do?',
      choices: expect.arrayContaining([
        expect.objectContaining({ value: 'resume' }),
        expect.objectContaining({ value: 'renew' }),
      ]),
    }))
    expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Select the QA plan to resume:',
      choices: [expect.objectContaining({ value: 'stored-plan@1' })],
    }))
    expect(execute).toHaveBeenCalledTimes(2)
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      phaseKey: 'qa_analysis', model: 'gemini-3.7-flash',
    }), expect.anything())
    expect(view.renderReport).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Saved plan resumed.' }))
    expect(log).not.toHaveBeenCalled()
    expect(prompts.input).not.toHaveBeenCalled()
    expect(prompts.editor).not.toHaveBeenCalled()
  })

  it('selects exactly one saved plan before resuming when multiple plans exist', async () => {
    const first = { ...storedPlan(), id: 'first-plan' }
    const second = { ...storedPlan(), id: 'second-plan', target: 'http://127.0.0.1:4000', criteria: ['First works'], scenarios: [{ ...storedPlan().scenarios[0], id: 'only-second' }] }
    new QaRunStore(workspace).savePlan(first)
    new QaRunStore(workspace).savePlan(second)
    prompts.select.mockResolvedValueOnce('resume').mockResolvedValueOnce('second-plan@1')
    const runner: IAgentRunner = { run: vi.fn()
      .mockResolvedValueOnce({ raw: '{"complete":true}' })
      .mockResolvedValueOnce({ raw: '{"summary":"Second plan resumed.","bugs":[],"errors":[]}' }) }
    const execute = vi.fn(async (scenario) => ({
      scenarioId: scenario.id, required: true, status: 'PASSED' as const,
      evidence: [{ id: scenario.id, path: scenario.id, capturedAt: '', adapter: 'test' }],
    }))
    const view = { start: vi.fn(), onProgress: vi.fn(), renderReport: vi.fn() }

    await cmdQa(workspace, [], {
      runner,
      drivers: [{ profile: 'api', doctor: async () => ({ available: true }), execute }],
      targetProbe: async () => ({ available: true }),
      view,
    })

    expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Select the QA plan to resume:',
      choices: expect.arrayContaining([
        expect.objectContaining({ value: 'first-plan@1' }),
        expect.objectContaining({ value: 'second-plan@1' }),
      ]),
    }))
    expect(view.start).toHaveBeenCalledWith(expect.objectContaining({ target: second.target }), workspace)
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining('second-plan') }), expect.anything())
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ id: 'only-second' }), expect.any(String), expect.any(String), undefined)
  })

  it('starts a new agentic plan when renew is selected in the form', async () => {
    new QaRunStore(workspace).savePlan(storedPlan())
    prompts.select.mockResolvedValueOnce('renew').mockResolvedValueOnce('type')
    prompts.input.mockResolvedValue('Create a fresh QA plan for checkout')
    const runner: IAgentRunner = { run: vi.fn().mockRejectedValue(new Error('stop after renew form')) }

    await expect(cmdQa(workspace, [], { runner })).rejects.toThrow('stop after renew form')

    expect(prompts.select).toHaveBeenCalledTimes(2)
    expect(prompts.input).toHaveBeenCalledWith(expect.objectContaining({ message: 'QA scope:' }))
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Create a fresh QA plan for checkout'),
    }), expect.any(Object))
  })

  it('writes a standalone plan', async () => {
    await cmdQa(workspace, ['plan', '--plan', 'orders', '--target', 'http://localhost:3000', '--criterion', 'Order saves', '--method', 'POST', '--path', '/orders', '--expect-status', '201'])

    expect(log).toHaveBeenCalledWith(expect.stringContaining('QA plan saved: orders@1'))
    expect(new QaRunStore(workspace).loadPlan('orders', 1).scenarios[0].request).toEqual({ method: 'POST', path: '/orders', expectedStatus: 201 })
  })

  it('renews a stored plan as a new complete run', async () => {
    const store = new QaRunStore(workspace)
    store.savePlan(storedPlan())
    const execute = vi.fn(async (scenario) => ({
      scenarioId: scenario.id, required: true, status: 'PASSED' as const,
      evidence: [{ id: 'renewed', path: 'response.body', capturedAt: '', adapter: 'test' }],
    }))

    await cmdQa(workspace, ['renew', '--plan', 'stored-plan@1'], {
      drivers: [{ profile: 'api', doctor: async () => ({ available: true }), execute }],
      targetProbe: async () => ({ available: true }),
    })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^QA plan renewed: stored-plan@1 as .+ \(PASS\)$/))
  })

  it('resumes only unfinished scenarios from a stored run', async () => {
    const store = new QaRunStore(workspace)
    store.savePlan(storedPlan())
    store.saveRun({
      schemaVersion: 1, id: 'partial-run', planId: 'stored-plan', planVersion: 1,
      target: 'http://127.0.0.1:3000', createdAt: '',
      results: [{ scenarioId: 'first', required: true, status: 'PASSED', evidence: [{ id: 'old', path: 'old', capturedAt: '', adapter: 'test' }] }],
    })
    const execute = vi.fn(async (scenario) => ({
      scenarioId: scenario.id, required: true, status: 'PASSED' as const,
      evidence: [{ id: 'resumed', path: 'response.body', capturedAt: '', adapter: 'test' }],
    }))

    await cmdQa(workspace, ['resume', '--run', 'partial-run'], {
      drivers: [{ profile: 'api', doctor: async () => ({ available: true }), execute }],
      targetProbe: async () => ({ available: true }),
    })

    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ id: 'second' }), expect.any(String), expect.any(String), undefined)
    expect(store.loadRun('partial-run').results.map((result) => result.scenarioId)).toEqual(['first', 'second'])
  })

  it('directs completed runs to renew instead of resuming them', async () => {
    const store = new QaRunStore(workspace)
    store.savePlan(storedPlan())
    store.saveRun({
      schemaVersion: 1, id: 'completed-run', planId: 'stored-plan', planVersion: 1,
      target: 'http://127.0.0.1:3000', createdAt: '', completedAt: '', verdict: 'PASS',
      results: storedPlan().scenarios.map((scenario) => ({
        scenarioId: scenario.id, required: true, status: 'PASSED' as const,
        evidence: [{ id: scenario.id, path: scenario.id, capturedAt: '', adapter: 'test' }],
      })),
    })

    await expect(cmdQa(workspace, ['resume', '--run', 'completed-run'])).rejects.toThrow('Use renew --plan stored-plan@1')
  })

  it('defaults to agentic phases, streams progress, and renders only the final QA report', async () => {
    const runner: IAgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ raw: JSON.stringify({
          id: 'health-human-flow', target: 'http://127.0.0.1:3000', profile: 'api',
          criteria: ['Health endpoint responds'],
          scenarios: [{
            id: 'health', criterionIds: ['criterion-1'], required: true, profile: 'api',
            request: { method: 'GET', path: '/health', expectedStatus: 200 },
          }],
        }) })
        .mockResolvedValueOnce({ raw: JSON.stringify({ complete: true }) })
        .mockResolvedValueOnce({ raw: JSON.stringify({ summary: 'Health check passed.', bugs: [], errors: [] }) }),
    }
    const driver: QaDriver = {
      profile: 'api', doctor: async () => ({ available: true }),
      execute: async (scenario) => ({
        scenarioId: scenario.id, required: true, status: 'PASSED',
        evidence: [{ id: 'response', path: 'response.body', capturedAt: '2026-09-11T00:00:00.000Z', adapter: 'curl' }],
      }),
    }
    const view = {
      start: vi.fn(),
      onProgress: vi.fn(),
      renderReport: vi.fn(),
    } as unknown as QaTerminalView

    await cmdQa(workspace, ['--debug', '--scope', 'Validate runtime behavior'], {
      runner, drivers: [driver], view, targetProbe: async () => ({ available: true }),
    })

    expect(view.start).toHaveBeenCalledWith(expect.objectContaining({ scope: 'Validate runtime behavior' }), workspace)
    expect(view.onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'phase_started', phase: 'PLANNING' }))
    expect(view.onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'scenario_completed', scenarioId: '001-health', status: 'PASSED' }))
    expect(view.renderReport).toHaveBeenCalledWith(expect.objectContaining({
      verdict: 'PASS', summary: 'Health check passed.', bugs: [], errors: [],
    }))
    expect(log).not.toHaveBeenCalled()
    expect(DebugContext.enabled).toBe(true)
  })
})

function storedPlan(): QaPlan {
  return {
    schemaVersion: 1,
    id: 'stored-plan',
    version: 1,
    target: 'http://127.0.0.1:3000',
    profile: 'api',
    createdAt: '',
    criteria: ['First works', 'Second works'],
    scenarios: [
      { id: 'first', criterionIds: ['criterion-1'], required: true, profile: 'api', request: { method: 'GET', path: '/first', expectedStatus: 200 } },
      { id: 'second', criterionIds: ['criterion-2'], required: true, profile: 'api', request: { method: 'GET', path: '/second', expectedStatus: 200 } },
    ],
  }
}
