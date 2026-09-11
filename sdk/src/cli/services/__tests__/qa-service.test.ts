import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmdQa, parseQaArgs } from '../qa-service'
import { QaRunStore } from '../../../qa/QaRunStore'
import type { IAgentRunner } from '../../../agent-runner/IAgentRunner'
import type { QaDriver } from '../../../qa/types'
import type { QaTerminalView } from '../../../qa/ui/QaTerminalView'
import { DebugContext } from '../../DebugContext'

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

  it('writes a standalone plan', async () => {
    await cmdQa(workspace, ['plan', '--plan', 'orders', '--target', 'http://localhost:3000', '--criterion', 'Order saves', '--method', 'POST', '--path', '/orders', '--expect-status', '201'])

    expect(log).toHaveBeenCalledWith(expect.stringContaining('QA plan saved: orders@1'))
    expect(new QaRunStore(workspace).loadPlan('orders', 1).scenarios[0].request).toEqual({ method: 'POST', path: '/orders', expectedStatus: 201 })
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
    expect(view.onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'scenario_completed', scenarioId: 'health', status: 'PASSED' }))
    expect(view.renderReport).toHaveBeenCalledWith(expect.objectContaining({
      verdict: 'PASS', summary: 'Health check passed.', bugs: [], errors: [],
    }))
    expect(log).not.toHaveBeenCalled()
    expect(DebugContext.enabled).toBe(true)
  })
})
