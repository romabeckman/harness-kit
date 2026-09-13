import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QaAuthConfigStore } from '../QaAuthConfigStore'
import { QaRunStore } from '../../services/QaRunStore'
import { QaService } from '../../services/QaService'
import type { QaDriver, QaDriverExecutionContext, QaPlan, QaScenario } from '../../types'

describe('QA authentication execution boundary', () => {
  const workspaces: string[] = []
  afterEach(() => workspaces.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })))

  it('resolves the selected profile only when passing execution context to a driver', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'qa-auth-execution-')); workspaces.push(workspace)
    mkdirSync(join(workspace, '.harness-kit'), { recursive: true })
    writeFileSync(join(workspace, '.harness-kit', 'auth.json'), JSON.stringify({ schemaVersion: 1, profiles: { user: { mode: 'bearer', token: { source: 'env', name: 'QA_TOKEN' } } } }), 'utf8')
    const execute = vi.fn(async (scenario: QaScenario, _target: string, _evidence: string, _signal?: AbortSignal, context?: QaDriverExecutionContext) => ({ scenarioId: scenario.id, required: scenario.required, status: 'PASSED' as const, evidence: [], auth: context?.auth }))
    const driver: QaDriver = { profile: 'api', doctor: async () => ({ available: true }), execute }
    const service = new QaService(new QaRunStore(workspace), [driver], async () => ({ available: true }), new QaAuthConfigStore(workspace, { QA_TOKEN: 'runtime-secret' }), 'user')

    await service.execute(plan())

    expect(execute).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.any(String), undefined, { auth: expect.objectContaining({ profile: 'user', headers: { Authorization: 'Bearer runtime-secret' } }) })
    expect(JSON.stringify(plan())).not.toContain('runtime-secret')
  })

  function plan(): QaPlan {
    return { schemaVersion: 1, id: 'protected', version: 1, target: 'http://qa.test', profile: 'api', createdAt: new Date().toISOString(), criteria: ['Protected endpoint works'], scenarios: [{ id: '001-protected', criterionIds: ['criterion-1'], required: true, profile: 'api' }] }
  }
})
