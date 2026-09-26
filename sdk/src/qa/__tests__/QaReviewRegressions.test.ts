import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QaAgenticOrchestrator } from '../QaAgenticOrchestrator'
import { QaExploratoryService } from '../services/QaExploratoryService'
import { QaRunStore } from '../services/QaRunStore'
import { QaAuthConfigStore } from '../auth/QaAuthConfigStore'
import { QaService } from '../services/QaService'
import { QaPlanningPhase } from '../phases/QaPlanningPhase'
import { QaReportingPhase } from '../phases/QaReportingPhase'
import { QaPlanValidator } from '../services/QaPlanValidator'
import { AccessibilityDriver } from '../engine/AccessibilityDriver'
import { auditAccessibility } from '../engine/AccessibilityDriver'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { QaDriver, QaPlan, QaScenario } from '../types'

describe('QA review regressions', () => {
  let workspace: string

  beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-review-')) })
  afterEach(() => { rmSync(workspace, { recursive: true, force: true }) })

  it('rejects plans that omit a supplied mandatory scenario', () => {
    const phase = new QaPlanningPhase()
    const output = {
      id: 'mandatory-review', target: 'http://qa.test', profile: 'api', criteria: ['Health is available'],
      scenarios: [{ id: 'health', criterionIds: ['criterion-1'], required: true, profile: 'api', request: { method: 'GET', path: '/health', expectedStatus: 200 } }],
    }

    expect(() => phase.parse(JSON.stringify(output), { scenarios: ['Checkout rejects an expired card'] }, 1))
      .toThrow(/mandatory scenario/i)
  })

  it('repairs a parsed plan that fails runtime contract validation', async () => {
    const invalid = plan({ scenarios: [{ ...apiScenario(), request: { method: 'GET', path: '/health', expectedStatus: 700 } }] })
    const valid = plan()
    const runner: IAgentRunner = { run: vi.fn()
      .mockResolvedValueOnce({ raw: JSON.stringify(invalid) })
      .mockResolvedValueOnce({ raw: JSON.stringify(valid) }) }
    const execute = vi.fn(async (scenario: QaScenario) => ({
      scenarioId: scenario.id, required: true, status: 'PASSED' as const,
      evidence: [{ id: 'response', path: 'response.json', capturedAt: new Date().toISOString(), adapter: 'test' }],
    }))
    const orchestrator = new QaAgenticOrchestrator({
      workspace, runner, report: false, runtime: { prepare: async () => undefined },
      drivers: [{ profile: 'api', doctor: async () => ({ available: true }), execute }],
      targetProbe: async () => ({ available: true }),
    })

    await expect(orchestrator.run()).resolves.toMatchObject({ verdict: 'PASS' })

    expect(runner.run).toHaveBeenCalledTimes(2)
    expect(vi.mocked(runner.run).mock.calls[1][0].prompt).toContain('expectedStatus must be an HTTP status')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('does not ask the planner to change a valid plan when a runtime prerequisite is unavailable', async () => {
    const runner: IAgentRunner = { run: vi.fn().mockResolvedValue({ raw: JSON.stringify(plan()) }) }
    const execute = vi.fn()
    const orchestrator = new QaAgenticOrchestrator({
      workspace, runner, report: false, runtime: { prepare: async () => undefined },
      drivers: [{ profile: 'api', doctor: async () => ({ available: false, reason: 'curl is unavailable' }), execute }],
      targetProbe: async () => ({ available: true }),
    })

    await expect(orchestrator.run({ scope: 'Check health endpoint' })).rejects.toThrow('api driver unavailable: curl is unavailable')

    expect(runner.run).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects zero browser wait timeouts in both parsing and validation', async () => {
    const invalidPlan = plan({
      profile: 'web',
      scenarios: [{ ...webScenario(), actions: [{ type: 'waitForSelector', selector: '#ready', timeout: 0 }] }],
    })

    expect(() => new QaPlanningPhase().parse(JSON.stringify(invalidPlan), {}, 1)).toThrow(/timeout/i)
    const validation = await new QaPlanValidator({ doctor: async () => ({ available: true }) } as any).validate(invalidPlan, workspace)
    expect(validation.valid).toBe(false)
    expect(validation.errors.join(' ')).toMatch(/timeout/i)
  })

  it('renders Markdown from reconciled results and counts blocked coverage as untested', async () => {
    const store = new QaRunStore(workspace)
    const planValue = plan()
    const failed = run(planValue, 'failed-markdown', 'FAIL', [{ scenarioId: '001-health', required: true, status: 'FAILED', reason: 'Observed HTTP 500', evidence: [] }])
    const reporting = new QaReportingPhase()
    const context = reportContext(workspace, store, planValue, failed, {
      summary: 'Every scenario succeeded without incident.', markdown: '# QA Report\n\n## Verdict\nPASS\n\n## Bugs\nNone.', bugs: [], errors: [],
    })

    await reporting.execute(context as any)

    const markdown = store.reportMarkdownPath(failed.id)
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(markdown, 'utf8')).toContain('FAIL')
    expect(readFileSync(markdown, 'utf8')).toContain('Observed HTTP 500')
    expect(readFileSync(markdown, 'utf8')).not.toContain('## Verdict\nPASS')
    expect(readFileSync(markdown, 'utf8')).not.toContain('Every scenario succeeded without incident.')

    const blocked = run(planValue, 'blocked-coverage', 'BLOCKED', [{ scenarioId: '001-health', required: true, status: 'BLOCKED', reason: 'Target unavailable', evidence: [] }])
    const blockedContext = reportContext(workspace, store, planValue, blocked, {})
    await reporting.execute(blockedContext as any)

    expect(blockedContext.report.coverageMatrix?.testedCategories).not.toContain('functional')
    expect(blockedContext.report.coverageMatrix?.untestedCategories).toContain('functional')
    expect(blockedContext.report.coverageMatrix?.areas.functional).toMatchObject({ total: 1, blocked: 1, untested: 0, inconclusive: 0 })

    const notRun = run(planValue, 'not-run-coverage', 'BLOCKED', [])
    const notRunContext = reportContext(workspace, store, planValue, notRun, {})
    await reporting.execute(notRunContext as any)
    expect(notRunContext.report.coverageMatrix?.areas.functional).toMatchObject({ total: 1, blocked: 0, untested: 1, inconclusive: 0 })
    expect(notRunContext.report.coverageMatrix?.untestedCategories).toContain('functional')
    expect(notRunContext.report.coverageMatrix?.untestedCategories).not.toContain('accessibility')
  })

  it('preserves anonymous identities when exploratory QA selects a default profile', async () => {
    const store = new QaRunStore(workspace)
    const scenario = { ...apiScenario(), authProfile: 'none' as const }
    store.savePlan(plan({ scenarios: [scenario] }))
    new QaAuthConfigStore(workspace).addProfile('qa-user', { mode: 'bearer', token: { source: 'literal', value: 'synthetic-secret' } })
    let observedMode: string | undefined
    let observedProfile: string | undefined
    const driver: QaDriver = {
      profile: 'api', doctor: async () => ({ available: true }),
      execute: async (current, _target, _directory, _signal, context) => {
        observedProfile = current.authProfile
        observedMode = context?.auth.mode
        return { scenarioId: current.id, required: current.required, status: 'PASSED', evidence: [{ id: 'fixture', path: 'fixture', capturedAt: new Date().toISOString(), adapter: 'test' }] }
      },
    }

    await new QaExploratoryService(workspace, store, [driver], async () => ({ available: true }))
      .execute({ authProfile: 'qa-user' })

    expect(observedProfile).toBe('none')
    expect(observedMode).not.toBe('bearer')
  })

  it('retargets saved browser navigation when exploratory QA overrides the target', async () => {
    const store = new QaRunStore(workspace)
    const webPlan = plan({
      profile: 'web', target: 'http://127.0.0.1:3000',
      scenarios: [{ ...webScenario(), actions: [{ type: 'navigate', value: 'http://127.0.0.1:3000/orders?state=open' }] }],
    })
    store.savePlan(webPlan)
    let observedTarget = ''
    let observedUrl = ''
    const driver: QaDriver = {
      profile: 'web', doctor: async () => ({ available: true }),
      execute: async (scenario, target) => {
        observedTarget = target
        observedUrl = scenario.actions?.[0].value ?? ''
        return { scenarioId: scenario.id, required: scenario.required, status: 'PASSED', evidence: [{ id: 'screen', path: 'screen.png', capturedAt: new Date().toISOString(), adapter: 'test' }] }
      },
    }

    const report = await new QaExploratoryService(workspace, store, [driver], async () => ({ available: true }))
      .execute({ target: 'http://127.0.0.1:4000' })

    expect(report.verdict).toBe('PASS')
    expect(observedTarget).toBe('http://127.0.0.1:4000')
    expect(observedUrl).toBe('http://127.0.0.1:4000/orders?state=open')
    expect(store.loadPlan(webPlan.id, webPlan.version).scenarios[0].actions?.[0].value).toBe('http://127.0.0.1:3000/orders?state=open')
  })

  it('uses the selected project to resolve relative CLI working directories', async () => {
    mkdirSync(join(workspace, 'src'))
    const store = new QaRunStore(workspace)
    let observedTarget = ''
    const driver: QaDriver = {
      profile: 'cli', doctor: async () => ({ available: true }),
      execute: async (scenario, target) => {
        observedTarget = target
        return { scenarioId: scenario.id, required: scenario.required, status: 'PASSED', evidence: [{ id: 'cli', path: 'cli.json', capturedAt: new Date().toISOString(), adapter: 'test' }] }
      },
    }

    await new QaService(store, [driver]).execute(plan({ profile: 'cli', target: 'src', scenarios: [{ ...apiScenario(), profile: 'cli', request: undefined, cli: { command: 'node', args: ['-p', 'process.cwd()'], expectedExitCode: 0 } }] }))

    expect(observedTarget).toBe(resolve(workspace, 'src'))
  })

  it('accepts implicit labels and still executes explicit accessibility assertions', async () => {
    const input = { tagName: 'INPUT', getAttribute: (_name: string) => null, labels: [{ textContent: 'Name' }] }
    const document = {
      documentElement: { lang: 'en' },
      querySelectorAll: (selector: string) => selector.startsWith('img') ? [] : [input],
      querySelector: () => null,
    }
    expect(auditAccessibility(document as any, {} as any)).toEqual([])

    const page: any = {
      on: vi.fn(), goto: vi.fn(),
      evaluate: vi.fn().mockResolvedValue([]),
      locator: vi.fn(() => ({ isVisible: vi.fn().mockResolvedValue(false) })),
      screenshot: vi.fn(async ({ path }: { path: string }) => writeFileSync(path, 'image')),
    }
    const driver = new AccessibilityDriver(async () => ({ chromium: { launch: async () => ({ newPage: async () => page, close: async () => undefined }) } }))
    const result = await driver.execute({ ...webScenario(), profile: 'accessibility', assertions: [{ type: 'visible', selector: '#missing' }] }, 'http://qa.test', join(workspace, 'a11y'))

    expect(result.status).toBe('FAILED')
  })

  it('recognizes explicit labels, valid aria names, and intrinsically named input types', () => {
    const makeInput = (id: string, attributes: Record<string, string>, options: { labels?: Array<{ textContent: string }>; value?: string } = {}) => ({
      id,
      tagName: 'INPUT',
      value: options.value ?? '',
      labels: options.labels ?? [],
      getAttribute: (name: string) => attributes[name] ?? null,
    })
    const implicit = makeInput('implicit', {}, { labels: [{ textContent: 'Name' }] })
    const explicit = makeInput('explicit', { id: 'explicit' })
    const labelledBy = makeInput('aria', { 'aria-labelledby': 'aria-name missing-name' })
    const unresolved = makeInput('unresolved', { 'aria-labelledby': 'missing-name' })
    const submit = makeInput('submit', { type: 'submit' })
    const imageButton = makeInput('image', { type: 'image', alt: 'Search' })
    const controls = [implicit, explicit, labelledBy, unresolved, submit, imageButton]
    const document = {
      documentElement: { lang: 'en' },
      querySelectorAll: (selector: string) => selector.startsWith('img') ? [] : controls,
      querySelector: (selector: string) => selector === 'label[for="explicit"]' ? { textContent: 'Email' } : null,
      getElementById: (id: string) => id === 'aria-name' ? { textContent: 'Account name' } : null,
    }

    expect(auditAccessibility(document as any, {} as any)).toEqual([{ rule: 'form-label', selector: '#unresolved' }])
  })
})

function apiScenario(): QaScenario {
  return { id: '001-health', criterionIds: ['criterion-1'], required: true, profile: 'api', request: { method: 'GET', path: '/health', expectedStatus: 200 } }
}

function webScenario(): QaScenario {
  return { id: '001-web', criterionIds: ['criterion-1'], required: true, profile: 'web', actions: [], assertions: [{ type: 'visible', selector: 'body' }] }
}

function plan(overrides: Partial<QaPlan> = {}): QaPlan {
  return {
    schemaVersion: 1, id: 'review-plan', version: 1, target: 'http://qa.test', profile: 'api',
    createdAt: new Date().toISOString(), criteria: ['Health is available'], scenarios: [apiScenario()], ...overrides,
  }
}

function run(planValue: QaPlan, id: string, verdict: 'FAIL' | 'BLOCKED', results: any[]): any {
  return { schemaVersion: 1, id, planId: planValue.id, planVersion: planValue.version, target: planValue.target, createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), verdict, results }
}

function reportContext(workspace: string, store: QaRunStore, planValue: QaPlan, runValue: any, response: unknown): Record<string, any> {
  return { workspace, request: { target: planValue.target, profile: planValue.profile }, store, plan: planValue, run: runValue, runner: { run: vi.fn().mockResolvedValue({ raw: JSON.stringify(response) }) } }
}
