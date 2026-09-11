import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QaRunStore } from '../services/QaRunStore'

describe('QaRunStore', () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-store-'))
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  it('rejects IDs that could escape the QA artifact directory', () => {
    const store = new QaRunStore(workspace)

    expect(() => store.planPath('../outside', 1)).toThrow('Invalid QA identifier')
    expect(() => store.runPath('run/child')).toThrow('Invalid QA identifier')
  })

  it('allocates a new immutable plan version instead of overwriting version one', () => {
    const store = new QaRunStore(workspace)

    expect(store.nextPlanVersion('orders')).toBe(1)
    store.savePlan({ schemaVersion: 1, id: 'orders', version: 1, target: 'http://127.0.0.1:3000', profile: 'api', createdAt: '', criteria: ['works'], scenarios: [] })

    expect(store.nextPlanVersion('orders')).toBe(2)
  })

  it('preserves the first original scope for a plan', () => {
    const store = new QaRunStore(workspace)
    const originalScope = '# Scope\r\nKeep this exact text.'

    store.saveScope('orders', originalScope)
    store.saveScope('orders', 'A later scope must not replace the original.')

    expect(readFileSync(store.scopePath('orders'), 'utf8')).toBe(originalScope)
  })

  it('finds the latest valid stored plan', () => {
    const store = new QaRunStore(workspace)
    store.savePlan({ schemaVersion: 1, id: 'orders', version: 1, target: 'http://127.0.0.1:3000', profile: 'api', createdAt: '2026-09-10T00:00:00.000Z', criteria: ['works'], scenarios: [] })
    store.savePlan({ schemaVersion: 1, id: 'orders', version: 2, target: 'http://127.0.0.1:3000', profile: 'api', createdAt: '2026-09-11T00:00:00.000Z', criteria: ['works'], scenarios: [] })

    expect(store.findLatestPlan()).toMatchObject({ id: 'orders', version: 2 })
  })

  it('formats evidence directories with a padded sequence and resolves existing scenarios', () => {
    const store = new QaRunStore(workspace)

    const first = store.evidenceDir('run-1', 'first-scenario', 1)
    const second = store.evidenceDir('run-1', 'second-scenario', 2)
    mkdirSync(first, { recursive: true })
    mkdirSync(second, { recursive: true })

    expect(first).toMatch(/evidence[\\/]001-first-scenario$/)
    expect(second).toMatch(/evidence[\\/]002-second-scenario$/)
    expect(store.evidenceDir('run-1', 'first-scenario')).toBe(first)
    expect(store.evidenceDir('run-1', 'third-scenario')).toMatch(/evidence[\\/]003-third-scenario$/)
  })

  it('does not duplicate the execution prefix when the scenario ID is already numbered', () => {
    const store = new QaRunStore(workspace)

    const evidence = store.evidenceDir('run-1', '001-openapi-metadata', 1)

    expect(evidence).toMatch(/evidence[\\/]001-openapi-metadata$/)
  })

  it('resolves the Markdown report path inside the run directory', () => {
    const store = new QaRunStore(workspace)

    expect(store.reportMarkdownPath('run-1')).toMatch(/[\\/]runs[\\/]run-1[\\/]REPORT\.md$/)
  })
})
