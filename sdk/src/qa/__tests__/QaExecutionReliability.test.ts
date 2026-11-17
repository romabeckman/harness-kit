import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QaAgenticOrchestrator } from '../QaAgenticOrchestrator'
import { PlaywrightDriver } from '../engine/PlaywrightDriver'
import { QaPlanValidator } from '../services/QaPlanValidator'
import { QaRunStore } from '../services/QaRunStore'
import { QaService } from '../services/QaService'
import { QaVerdictPolicy } from '../services/QaVerdictPolicy'
import { retargetQaPlan } from '../utils/QaPlanRetargeting'
import type { QaDriver, QaPlan, QaScenario } from '../types'

describe('QA execution reliability', () => {
  let workspace: string
  beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-reliability-')) })
  afterEach(() => { rmSync(workspace, { recursive: true, force: true }) })

  it('reports an adaptive driver exception without retaining the previous PASS', async () => {
    const initial = plan()
    const revised = { ...initial, criteria: [...initial.criteria, 'Second response'], scenarios: [...initial.scenarios, apiScenario('002-second', 'criterion-2')] }
    const store = new QaRunStore(workspace)
    const orchestrator = new QaAgenticOrchestrator({
      workspace, store, analysis: true, report: false,
      runtime: { prepare: async () => undefined }, targetProbe: async () => ({ available: true }),
      runner: { run: async (invocation) => ({ raw: JSON.stringify(invocation.phaseKey === 'qa_planning' ? initial : { complete: false, plan: revised }) }) },
      drivers: [driver(async (scenario) => {
        if (scenario.id === '002-second') throw new Error('Driver transport failed')
        return passed(scenario)
      })],
    })

    const report = await orchestrator.run()

    expect(report.verdict).toBe('BLOCKED')
    expect(report.successCriteria.map((criterion) => criterion.status)).toEqual(['PASSED', 'BLOCKED'])
    expect(store.loadRun(report.runId)).toMatchObject({ verdict: 'BLOCKED', planVersion: 2, results: [
      { scenarioId: '001-first', status: 'PASSED' }, { scenarioId: '002-second', status: 'BLOCKED', reason: 'Driver transport failed' },
    ] })
  })

  it('invalidates a completed run before attempting continuation prerequisites', async () => {
    const store = new QaRunStore(workspace)
    const probe = vi.fn().mockResolvedValueOnce({ available: true }).mockRejectedValueOnce(new Error('Probe failed'))
    const service = new QaService(store, [driver(async (scenario) => passed(scenario))], probe)
    const original = plan()
    const run = await service.execute(original)
    const next = { ...original, version: 2, scenarios: [...original.scenarios, apiScenario('002-second')] }

    await expect(service.continue(run, next, next.scenarios.slice(1))).rejects.toThrow('Probe failed')

    expect(store.loadRun(run.id)).toMatchObject({ planVersion: 2 })
    expect(store.loadRun(run.id).verdict).toBeUndefined()
    expect(store.loadRun(run.id).completedAt).toBeUndefined()
  })

  it('reconciles driver results against required scenarios before granting PASS', async () => {
    const service = new QaService(new QaRunStore(workspace), [driver(async (scenario) => ({ ...passed(scenario), scenarioId: 'unrelated' }))], async () => ({ available: true }))

    expect((await service.execute(plan())).verdict).toBe('INCONCLUSIVE')
  })

  it('keeps failure precedence when a required result is also missing', () => {
    // Extra planned scenarios must never mask an observed failure.
    expect(QaVerdictPolicy.evaluate([{ required: true, status: 'FAILED', evidence: [] }])).toBe('FAIL')
  })

  it('retargets waits and assertions without changing the saved plan', async () => {
    const original: QaPlan = { ...plan(), profile: 'web', scenarios: [{
      id: '001-ready', criterionIds: ['criterion-1'], required: true, profile: 'web',
      actions: [{ type: 'navigate', value: originalTarget + '/start' }, { type: 'waitForUrl', value: originalTarget + '/ready?state=open#details' }],
      assertions: [{ type: 'url', value: originalTarget + '/ready?state=open#details' }],
    }] }

    const next = retargetQaPlan(original, 'http://127.0.0.1:5000')

    expect(next.scenarios[0].actions?.[1].value).toBe('http://127.0.0.1:5000/ready?state=open#details')
    expect(original.scenarios[0].actions?.[1].value).toContain(':4000/')
    expect(await new QaPlanValidator().validateContract(next, workspace)).toMatchObject({ valid: true })
  })

  it('retargets absolute HTTP requests but preserves relative paths and foreign URLs', () => {
    const original = plan()
    original.scenarios = [
      { ...apiScenario('001-absolute'), request: { method: 'GET', path: originalTarget + '/items?limit=1', expectedStatus: 200 } },
      apiScenario('002-relative'),
      { ...apiScenario('003-foreign'), request: { method: 'GET', path: 'https://foreign.test/items', expectedStatus: 200 } },
    ]

    const next = retargetQaPlan(original, 'http://127.0.0.1:5000')

    expect(next.scenarios.map((scenario) => scenario.request?.path)).toEqual(['http://127.0.0.1:5000/items?limit=1', '/', 'https://foreign.test/items'])
  })

  it('rejects an installed Playwright module whose browser cannot launch', async () => {
    const browser = new PlaywrightDriver('web', async () => ({ chromium: { launch: async () => { throw new Error('Executable does not exist') } } }))

    expect(await browser.doctor()).toMatchObject({ available: false, reason: expect.stringContaining('Executable does not exist') })
  })

  it('closes the browser used to verify driver availability', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const launch = vi.fn().mockResolvedValue({ close })
    const browser = new PlaywrightDriver('web', async () => ({ chromium: { launch } }))

    expect(await browser.doctor()).toEqual({ available: true })
    expect(launch).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})

const originalTarget = 'http://127.0.0.1:4000'
function apiScenario(id = '001-first', criterionId = 'criterion-1'): QaScenario {
  return { id, criterionIds: [criterionId], required: true, profile: 'api', request: { method: 'GET', path: '/', expectedStatus: 200 } }
}
function plan(): QaPlan {
  return { schemaVersion: 1, id: 'reliability', version: 1, target: originalTarget, profile: 'api', createdAt: new Date().toISOString(), criteria: ['First response'], scenarios: [apiScenario()] }
}
function passed(scenario: QaScenario) {
  return { scenarioId: scenario.id, required: scenario.required, status: 'PASSED' as const, evidence: [{ id: 'response', path: 'response.json', capturedAt: new Date().toISOString(), adapter: 'test' }] }
}
function driver(execute: QaDriver['execute']): QaDriver {
  return { profile: 'api', doctor: async () => ({ available: true }), execute }
}
