import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmdQa, parseQaArgs } from '../qa-service'
import { QaRunStore } from '../../../qa/services/QaRunStore'
import type { IAgentRunner } from '../../../agent-runner/IAgentRunner'
import type { QaDriver, QaPlan, QaRun } from '../../../qa/types'

const prompts = vi.hoisted(() => ({ confirm: vi.fn(), editor: vi.fn(), input: vi.fn(), password: vi.fn(), select: vi.fn() }))

vi.mock('@inquirer/prompts', () => prompts)

describe('QA CLI', () => {
  let workspace: string
  let log: ReturnType<typeof vi.spyOn>
  let warning: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    prompts.editor.mockReset()
    prompts.input.mockReset()
    prompts.password.mockReset()
    prompts.select.mockReset()
    prompts.confirm.mockReset()
    workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-cli-'))
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    log.mockRestore()
    warning.mockRestore()
    rmSync(workspace, { recursive: true, force: true })
  })

  it('supports run, report, and exploratory actions and defaults to run', () => {
    expect(parseQaArgs([])).toMatchObject({ action: 'run' })
    expect(parseQaArgs(['run'])).toMatchObject({ action: 'run', report: false })
    expect(parseQaArgs(['run', '--report'])).toMatchObject({ action: 'run', report: true })
    expect(parseQaArgs(['run', '--scope', 'Test endpoint X'])).toMatchObject({ action: 'run', scope: 'Test endpoint X' })
    expect(parseQaArgs(['report', '--run', 'orders-20260911'])).toMatchObject({ action: 'report', runId: 'orders-20260911' })
    expect(parseQaArgs(['exploratory', '--target', 'http://qa.test'])).toMatchObject({ action: 'exploratory', target: 'http://qa.test' })
    expect(parseQaArgs(['run', '--auth', 'admin'])).toMatchObject({ action: 'run', authProfile: 'admin' })
    expect(parseQaArgs(['exploratory', '--auth=qa-user'])).toMatchObject({ action: 'exploratory', authProfile: 'qa-user' })
    expect(parseQaArgs(['auth'])).toMatchObject({ action: 'auth' })
    expect(() => parseQaArgs(['auth', '--target', 'http://qa.test'])).toThrow('--target is only valid')
    expect(() => parseQaArgs(['report', '--report'])).toThrow('--report is only valid with hrns qa run')
    expect(() => parseQaArgs(['exploratory', '--scope', 'new scope'])).toThrow('--scope is only valid with hrns qa run')
    expect(() => parseQaArgs(['exploratory', '--run', 'stored-run'])).toThrow('--run is only valid with hrns qa report')
    for (const legacy of ['agentic', 'plan', 'execute', 'renew', 'resume', 'doctor']) {
      expect(() => parseQaArgs([legacy])).toThrow(`Unknown QA action: ${legacy}`)
    }
  })

  it('creates a bearer profile through the auth form and preserves the token', async () => {
    prompts.select.mockResolvedValueOnce('bearer').mockResolvedValueOnce('env')
    prompts.input.mockResolvedValueOnce('qa-user')
    prompts.input.mockResolvedValueOnce('QA_USER_TOKEN')

    await cmdQa(workspace, ['auth'])

    const saved = JSON.parse(readFileSync(join(workspace, '.harness-kit', 'auth.json'), 'utf8'))
    expect(saved).toEqual({ schemaVersion: 1, profiles: { 'qa-user': { mode: 'bearer', token: { source: 'env', name: 'QA_USER_TOKEN' } } } })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('qa-user'))
  })

  it('adds basic credentials and preserves the entered password', async () => {
    prompts.select.mockResolvedValueOnce('basic').mockResolvedValueOnce('env')
    prompts.input.mockResolvedValueOnce('admin').mockResolvedValueOnce('qa-admin')
    prompts.input.mockResolvedValueOnce('QA_ADMIN_PASSWORD')

    await cmdQa(workspace, ['auth'])

    const saved = JSON.parse(readFileSync(join(workspace, '.harness-kit', 'auth.json'), 'utf8'))
    expect(saved.profiles.admin).toEqual({ mode: 'basic', username: 'qa-admin', password: { source: 'env', name: 'QA_ADMIN_PASSWORD' } })
  })

  it('preserves a password entered by the auth form for later execution', async () => {
    prompts.select.mockResolvedValueOnce('basic').mockResolvedValueOnce('insecure')
    prompts.confirm.mockResolvedValueOnce(true)
    prompts.input.mockResolvedValueOnce('roma').mockResolvedValueOnce('roma')
    prompts.password.mockResolvedValueOnce('password-entered-in-form')

    await cmdQa(workspace, ['auth'])

    const saved = JSON.parse(readFileSync(join(workspace, '.harness-kit', 'auth.json'), 'utf8'))
    expect(saved.profiles.roma).toEqual({ mode: 'basic', storage: 'insecure', username: 'roma', password: { source: 'literal', value: 'password-entered-in-form' } })
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('WARNING'))
  })

  it('does not create a profile when insecure storage is declined', async () => {
    prompts.select.mockResolvedValueOnce('basic').mockResolvedValueOnce('insecure')
    prompts.confirm.mockResolvedValueOnce(false)

    await expect(cmdQa(workspace, ['auth'])).rejects.toThrow('Insecure credential storage cancelled')
    expect(existsSync(join(workspace, '.harness-kit', 'auth.json'))).toBe(false)
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('WARNING'))
  })

  it('appends a second profile without replacing the existing configuration', async () => {
    prompts.select.mockResolvedValueOnce('none')
    prompts.input.mockResolvedValueOnce('anonymous')
    await cmdQa(workspace, ['auth'])

    prompts.select.mockResolvedValueOnce('api-key').mockResolvedValueOnce('env')
    prompts.input.mockResolvedValueOnce('service').mockResolvedValueOnce('X-Service-Key')
    prompts.input.mockResolvedValueOnce('QA_SERVICE_KEY')
    await cmdQa(workspace, ['auth'])

    const saved = JSON.parse(readFileSync(join(workspace, '.harness-kit', 'auth.json'), 'utf8'))
    expect(Object.keys(saved.profiles)).toEqual(['anonymous', 'service'])
  })

  it('preserves equals signs in inline options', () => {
    expect(parseQaArgs(['--scope=Check x=1 and y=2', '--target=http://qa.test/?x=1&y=2', '--scenario=Expect a=b']))
      .toMatchObject({ scope: 'Check x=1 and y=2', target: 'http://qa.test/?x=1&y=2', scenarios: ['Expect a=b'] })
  })

  it('rejects blank explicit scope before starting the runner', async () => {
    const runner: IAgentRunner = { run: vi.fn() }
    await expect(cmdQa(workspace, ['run', '--scope', '   '], { runner })).rejects.toThrow('scope')
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('validates interactive target input and offers a profile choice', async () => {
    prompts.select.mockResolvedValueOnce('type').mockResolvedValueOnce('api')
    prompts.input.mockResolvedValueOnce('Check endpoint response contract').mockResolvedValueOnce('http://qa.test')
    const runner: IAgentRunner = { run: vi.fn().mockRejectedValue(new Error('stop after prompt')) }
    await expect(cmdQa(workspace, ['run'], { runner })).rejects.toThrow('stop after prompt')
    const targetPrompt = prompts.input.mock.calls[1][0]
    expect(targetPrompt.validate).toBeTypeOf('function')
    expect(targetPrompt.validate('not a URL')).not.toBe(true)
    expect(targetPrompt.validate('http://qa.test')).toBe(true)
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining('<profile_hint>\napi') }), expect.anything())
  })

  it('prompts for scope when run omits --scope', async () => {
    prompts.select.mockResolvedValueOnce('type').mockResolvedValueOnce(undefined)
    prompts.input.mockResolvedValueOnce('Validate the complete checkout flow').mockResolvedValueOnce('')
    const runner: IAgentRunner = { run: vi.fn().mockRejectedValue(new Error('stop after prompt')) }

    await expect(cmdQa(workspace, ['run'], { runner })).rejects.toThrow('stop after prompt')

    expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('QA scope') }))
    expect(prompts.input).toHaveBeenCalledWith(expect.objectContaining({ message: 'QA scope:', validate: expect.any(Function) }))
    expect(prompts.input).toHaveBeenNthCalledWith(2, expect.objectContaining({ message: 'Target application URL (optional):', validate: expect.any(Function) }))
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      phaseKey: 'qa_planning', prompt: expect.stringContaining('Validate the complete checkout flow'),
    }), expect.any(Object))
  })

  it('offers saved-plan resume and selects a plan without replanning', async () => {
    const store = new QaRunStore(workspace)
    const plan = storedPlan()
    store.savePlan(plan)
    prompts.select.mockResolvedValueOnce('resume').mockResolvedValueOnce('stored-plan@1')
    const run = vi.fn(async (invocation) => {
      if (invocation.phaseKey === 'qa_analysis') return { raw: '{"complete":true}' }
      return { raw: JSON.stringify({ summary: 'Stored plan resumed.', bugs: [], errors: [] }) }
    })
    const runner: IAgentRunner = { run }
    const driver: QaDriver = {
      profile: 'api',
      doctor: async () => ({ available: true }),
      execute: async (scenario) => ({
        scenarioId: scenario.id, required: true, status: 'PASSED',
        evidence: [{ id: 'response', path: 'response.body', capturedAt: '', adapter: 'test' }],
      }),
    }
    const view = { start: vi.fn(), onProgress: vi.fn(), renderReport: vi.fn() }

    await cmdQa(workspace, ['--report'], { runner, drivers: [driver], view, targetProbe: async () => ({ available: true }) })

    expect(prompts.select).toHaveBeenNthCalledWith(1, expect.objectContaining({
      message: 'A saved QA plan exists. What would you like to do?',
      choices: [expect.objectContaining({ value: 'resume' }), expect.objectContaining({ value: 'new' })],
    }))
    expect(prompts.select).toHaveBeenNthCalledWith(2, expect.objectContaining({
      message: 'Select the QA plan to resume:',
      choices: [expect.objectContaining({ value: 'stored-plan@1' })],
    }))
    expect(run.mock.calls.map(([invocation]) => invocation.phaseKey)).toEqual(['qa_analysis', 'qa_reporting'])
    expect(view.start).toHaveBeenCalledWith({ target: plan.target, profile: plan.profile }, workspace)
    expect(view.renderReport).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Stored plan resumed.' }))
  })

  it('uses new flow after selecting new for a saved plan', async () => {
    const store = new QaRunStore(workspace)
    store.savePlan(storedPlan())
    prompts.select.mockResolvedValueOnce('new').mockResolvedValueOnce('type').mockResolvedValueOnce(undefined)
    prompts.input.mockResolvedValueOnce('Validate new runtime behavior').mockResolvedValueOnce('http://127.0.0.1:3000')
    const runner = agenticRunner()
    const driver: QaDriver = {
      profile: 'api',
      doctor: async () => ({ available: true }),
      execute: async (scenario) => ({
        scenarioId: scenario.id, required: true, status: 'PASSED',
        evidence: [{ id: 'response', path: 'response.body', capturedAt: '', adapter: 'test' }],
      }),
    }
    const view = { start: vi.fn(), onProgress: vi.fn(), renderReport: vi.fn() }

    await cmdQa(workspace, [], { runner, drivers: [driver], view, targetProbe: async () => ({ available: true }) })

    expect(prompts.select).toHaveBeenNthCalledWith(1, expect.objectContaining({
      message: 'A saved QA plan exists. What would you like to do?',
    }))
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      phaseKey: 'qa_planning', prompt: expect.stringContaining('Validate new runtime behavior'),
    }), expect.any(Object))
    expect(view.start).toHaveBeenCalledWith(expect.objectContaining({ scope: 'Validate new runtime behavior' }), workspace)
  })

  it('passes an interactive target entered after the QA scope to planning', async () => {
    prompts.select.mockResolvedValueOnce('type').mockResolvedValueOnce(undefined)
    prompts.input.mockResolvedValueOnce('Validate the checkout flow').mockResolvedValueOnce('http://127.0.0.1:3000')
    const runner: IAgentRunner = { run: vi.fn().mockRejectedValue(new Error('stop after prompt')) }

    await expect(cmdQa(workspace, ['run'], { runner })).rejects.toThrow('stop after prompt')

    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      phaseKey: 'qa_planning', prompt: expect.stringContaining('Target URL hint: http://127.0.0.1:3000'),
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

    await cmdQa(workspace, ['run', '--report', '--scope', 'Validate runtime behavior'], {
      runner, drivers: [driver], view, targetProbe: async () => ({ available: true }),
    })

    expect(runner.run).toHaveBeenCalledTimes(3)
    expect(view.start).toHaveBeenCalledWith(expect.objectContaining({ scope: 'Validate runtime behavior' }), workspace)
    expect(view.onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'scenario_completed', status: 'PASSED' }))
    expect(view.renderReport).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'PASS', summary: 'Health check passed.' }))
    expect(log).not.toHaveBeenCalled()
  })

  it('skips report generation during a run unless --report is provided', async () => {
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

    expect(vi.mocked(runner.run).mock.calls.map(([invocation]) => invocation.phaseKey)).toEqual(['qa_planning', 'qa_analysis'])
    expect(view.renderReport).not.toHaveBeenCalled()
    const run = new QaRunStore(workspace).listCompletedRuns()[0]
    expect(run).toBeDefined()
    expect(() => new QaRunStore(workspace).loadReport(run!.id)).toThrow()
  })

  it('sends only failed and blocked scenarios to a quick development renewal', async () => {
    const runner: IAgentRunner = { run: vi.fn(async (invocation) => {
      if (invocation.phaseKey === 'qa_planning') return { raw: JSON.stringify({
        id: 'renewal-flow', target: 'http://127.0.0.1:3000', profile: 'api', criteria: ['Runtime works'],
        scenarios: [
          { id: 'passes', description: 'Healthy endpoint works', criterionIds: ['criterion-1'], required: true, profile: 'api', category: 'functional', request: { method: 'GET', path: '/health', expectedStatus: 200 } },
          { id: 'fails', description: 'Order endpoint creates an order', criterionIds: ['criterion-1'], required: true, profile: 'api', category: 'functional', request: { method: 'POST', path: '/orders', expectedStatus: 201 } },
          { id: 'blocks', description: 'Admin endpoint is reachable', criterionIds: ['criterion-1'], required: true, profile: 'api', category: 'functional', request: { method: 'GET', path: '/admin', expectedStatus: 200 } },
        ],
      }) }
      return { raw: '{"complete":true}' }
    }) }
    const driver: QaDriver = {
      profile: 'api', doctor: async () => ({ available: true }),
      execute: async (scenario) => ({
        scenarioId: scenario.id, required: true,
        status: scenario.id.includes('fails') ? 'FAILED' : scenario.id.includes('blocks') ? 'BLOCKED' : 'PASSED',
        reason: scenario.id.includes('fails') ? 'Expected 201, received 500' : scenario.id.includes('blocks') ? 'Connection refused' : undefined,
        evidence: scenario.id.includes('blocks') ? [] : [{ id: scenario.id, path: `evidence/${scenario.id}.json`, capturedAt: '', adapter: 'test' }],
      }),
    }
    const confirmSendToFix = vi.fn().mockResolvedValue(true)
    const confirmDevelopmentOption = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const selectDevelopmentMode = vi.fn().mockResolvedValue('deep_thinking')
    const runCommand = vi.fn().mockResolvedValue(undefined)

    await cmdQa(workspace, ['run', '--scope', 'Validate runtime', '--agent', 'codex-cli', '--model', 'gpt-5', '--effort', 'high', '--debug'], {
      runner, drivers: [driver], targetProbe: async () => ({ available: true }), confirmSendToFix,
      confirmDevelopmentOption, selectDevelopmentMode, runCommand,
      view: { start: vi.fn(), onProgress: vi.fn(), renderReport: vi.fn() },
    })

    expect(confirmSendToFix).toHaveBeenCalledWith({
      message: 'Send failed and blocked scenarios to fix?', default: false,
    })
    expect(confirmDevelopmentOption.mock.calls).toEqual([
      [{ message: 'Keep model "gpt-5"?', default: true }],
      [{ message: 'Keep effort "high"?', default: true }],
      [{ message: 'Run deploy?', default: true }],
    ])
    expect(selectDevelopmentMode).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Select development mode:', default: 'quick',
      choices: expect.arrayContaining([
        expect.objectContaining({ value: 'quick' }),
        expect.objectContaining({ value: 'fast' }),
        expect.objectContaining({ value: 'thinking' }),
        expect.objectContaining({ value: 'deep_thinking' }),
      ]),
    }))
    expect(runCommand).toHaveBeenCalledTimes(1)
    const [runCwd, runArgs] = runCommand.mock.calls[0]
    expect(runCwd).toBe(workspace)
    expect(runArgs).toEqual(expect.arrayContaining([
      '--reset', '--mode', 'deep_thinking', '--path', workspace, '--skip-deploy',
      '--agent', 'codex-cli', '--effort', 'high', '--debug',
    ]))
    expect(runArgs).not.toContain('--model')
    const scope = runArgs[runArgs.indexOf('--scope') + 1]
    expect(scope).toContain('002-fails')
    expect(scope).toContain('FAILED')
    expect(scope).toContain('003-blocks')
    expect(scope).toContain('BLOCKED')
    expect(scope).not.toContain('001-passes')
    expect(scope).not.toContain('Healthy endpoint works')
  })

  it('asks only for mode and deploy when QA did not receive model or effort flags', async () => {
    const runner: IAgentRunner = { run: vi.fn(async (invocation) => invocation.phaseKey === 'qa_planning'
      ? { raw: JSON.stringify({
          id: 'flagless-renewal', target: 'http://127.0.0.1:3000', profile: 'api', criteria: ['Health works'],
          scenarios: [{ id: 'health', criterionIds: ['criterion-1'], required: true, profile: 'api', category: 'functional', request: { method: 'GET', path: '/health', expectedStatus: 200 } }],
        }) }
      : { raw: '{"complete":true}' }) }
    const confirmDevelopmentOption = vi.fn().mockResolvedValue(true)
    const selectDevelopmentMode = vi.fn().mockResolvedValue('fast')
    const runCommand = vi.fn().mockResolvedValue(undefined)

    await cmdQa(workspace, ['run', '--scope', 'Validate health'], {
      runner,
      drivers: [{
        profile: 'api', doctor: async () => ({ available: true }),
        execute: async (scenario) => ({ scenarioId: scenario.id, required: true, status: 'FAILED', reason: 'Expected 200, received 500', evidence: [] }),
      }],
      targetProbe: async () => ({ available: true }), confirmSendToFix: async () => true,
      confirmDevelopmentOption, selectDevelopmentMode, runCommand,
      view: { start: vi.fn(), onProgress: vi.fn(), renderReport: vi.fn() },
    })

    expect(confirmDevelopmentOption).toHaveBeenCalledOnce()
    expect(confirmDevelopmentOption).toHaveBeenCalledWith({ message: 'Run deploy?', default: true })
    const runArgs = runCommand.mock.calls[0][1]
    expect(runArgs).toEqual(expect.arrayContaining(['--mode', 'fast']))
    expect(runArgs).not.toContain('--model')
    expect(runArgs).not.toContain('--effort')
    expect(runArgs).not.toContain('--skip-deploy')
  })

  it('does not offer development renewal when QA has no failed or blocked scenarios', async () => {
    const confirmSendToFix = vi.fn().mockResolvedValue(true)
    const runCommand = vi.fn().mockResolvedValue(undefined)
    const driver: QaDriver = {
      profile: 'api', doctor: async () => ({ available: true }),
      execute: async (scenario) => ({ scenarioId: scenario.id, required: true, status: 'PASSED', evidence: [] }),
    }

    await cmdQa(workspace, ['run', '--scope', 'Validate runtime'], {
      runner: agenticRunner(), drivers: [driver], targetProbe: async () => ({ available: true }),
      confirmSendToFix, runCommand, view: { start: vi.fn(), onProgress: vi.fn(), renderReport: vi.fn() },
    })

    expect(confirmSendToFix).not.toHaveBeenCalled()
    expect(runCommand).not.toHaveBeenCalled()
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

  it('executes every scenario from the latest version of every saved plan and persists a global report', async () => {
    const store = new QaRunStore(workspace)
    store.savePlan({ ...storedPlan(), version: 1, createdAt: '2026-09-10T00:00:00.000Z' })
    store.savePlan({
      ...storedPlan(), version: 2, createdAt: '2026-09-11T00:00:00.000Z',
      scenarios: [
        { ...storedPlan().scenarios[0], id: '001-health-v2' },
        { ...storedPlan().scenarios[0], id: '002-orders' },
      ],
    })
    store.savePlan({
      ...storedPlan(), id: 'security-plan', version: 1, createdAt: '2026-09-12T00:00:00.000Z',
      scenarios: [{ ...storedPlan().scenarios[0], id: '001-security' }],
    })
    const executed: string[] = []
    const driver: QaDriver = {
      profile: 'api', doctor: async () => ({ available: true }),
      execute: async (scenario) => {
        executed.push(scenario.id)
        return {
          scenarioId: scenario.id, required: true,
          status: scenario.id === '002-orders' ? 'FAILED' : 'PASSED',
          reason: scenario.id === '002-orders' ? 'Expected 201, received 500' : undefined,
          evidence: [{ id: scenario.id, path: `evidence/${scenario.id}.json`, capturedAt: '', adapter: 'test' }],
        }
      },
    }

    await cmdQa(workspace, ['exploratory', '--target', 'http://qa.test'], {
      drivers: [driver], targetProbe: async () => ({ available: true }),
    })

    expect(executed).toEqual(['001-security', '001-health-v2', '002-orders'])
    const report = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(report).toMatchObject({
      schemaVersion: 1, verdict: 'FAIL',
      totals: { plans: 2, scenarios: 3, passed: 2, failed: 1, blocked: 0, inconclusive: 0 },
    })
    expect(report.plans).toEqual(expect.arrayContaining([
      expect.objectContaining({ planId: 'stored-plan', planVersion: 2, target: 'http://qa.test', verdict: 'FAIL' }),
      expect.objectContaining({ planId: 'security-plan', planVersion: 1, target: 'http://qa.test', verdict: 'PASS' }),
    ]))
    expect(existsSync(store.exploratoryReportPath(report.id))).toBe(true)
    expect(store.loadExploratoryReport(report.id)).toEqual(report)
  })

  it('records an invalid plan and continues exploratory execution', async () => {
    const store = new QaRunStore(workspace)
    store.savePlan(storedPlan())
    store.savePlan({ ...storedPlan(), id: 'broken-plan', profile: 'web', scenarios: [] })
    const driver: QaDriver = {
      profile: 'api', doctor: async () => ({ available: true }),
      execute: async (scenario) => ({
        scenarioId: scenario.id, required: true, status: 'PASSED',
        evidence: [{ id: scenario.id, path: scenario.id, capturedAt: '', adapter: 'test' }],
      }),
    }

    await cmdQa(workspace, ['exploratory'], {
      drivers: [driver], targetProbe: async () => ({ available: true }),
    })

    const report = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(report.verdict).toBe('BLOCKED')
    expect(report.plans).toEqual(expect.arrayContaining([
      expect.objectContaining({ planId: 'stored-plan', verdict: 'PASS' }),
      expect.objectContaining({ planId: 'broken-plan', verdict: 'BLOCKED', error: expect.stringContaining('validation failed') }),
    ]))
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
