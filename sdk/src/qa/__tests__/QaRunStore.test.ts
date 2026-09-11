import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QaRunStore } from '../QaRunStore'

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
})
