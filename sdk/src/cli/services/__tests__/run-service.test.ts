import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QaRunStore } from '../../../qa/services/QaRunStore'
import type { QaPlan, QaRun } from '../../../qa/types'
import { AgentRunnerFactory } from '../../../agent-runner/AgentRunnerFactory'
import type { IAgentRunner } from '../../../agent-runner/IAgentRunner'
import { FileStateManager } from '../../../file-state/FileStateManager'
import { resolveResetOptions, cmdRun } from '../run-service'
import { parseRunArgs } from '../../utils/run-args-parser'

const prompts = vi.hoisted(() => ({ select: vi.fn() }))
const orchestrator = vi.hoisted(() => ({ run: vi.fn(), tokenReport: vi.fn(), getState: vi.fn(), applySteeringActions: vi.fn() }))

vi.mock('@inquirer/prompts', () => prompts)
vi.mock('../../../orchestrator/HarnessOrchestrator', () => ({
  HarnessOrchestrator: class {
    constructor() {
      Object.assign(this, orchestrator)
    }
  },
}))

describe('run service QA correction', () => {
  const workspaces: string[] = []

  afterEach(() => {
    for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true })
  })

  it('generates reset scope from failed and blocked results selected by --run', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'hrns-run-qa-'))
    workspaces.push(workspace)
    seedQaRun(workspace)

    const result = await resolveResetOptions(workspace, parseRunArgs(['--run', 'orders-run']))

    expect(result.optionsReset.projectPaths).toEqual([workspace])
    expect(result.optionsReset.scope).toContain('Renew development from QA run orders-run.')
    expect(result.optionsReset.scope).toContain('FAILED: create-order')
    expect(result.optionsReset.scope).toContain('Expected 201, received 500')
    expect(result.optionsReset.scope).toContain('BLOCKED: admin-orders')
    expect(result.optionsReset.scope).not.toContain('PASSED: list-orders')
  })

  it('rejects combining generated QA scope with an explicit scope', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'hrns-run-qa-'))
    workspaces.push(workspace)

    await expect(resolveResetOptions(
      workspace,
      parseRunArgs(['--run', 'orders-run', '--scope', 'conflicting scope']),
    )).rejects.toThrow('either --scope or --run')
  })

  it('prompts for an agent runner when run omits --agent', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'hrns-run-agent-'))
    workspaces.push(workspace)
    prompts.select.mockReset().mockResolvedValueOnce('codex-cli')
    orchestrator.run.mockReset().mockResolvedValue(undefined)
    orchestrator.tokenReport.mockReset()
    const runner: IAgentRunner = { run: vi.fn() }
    const createRunner = vi.spyOn(AgentRunnerFactory, 'create').mockReturnValue(runner)
    const loadBacklog = vi.spyOn(FileStateManager.prototype, 'loadBacklog').mockReturnValue([])

    try {
      await cmdRun(workspace, [
        '--reset', '--mode', 'quick', '--scope', 'Run agent selection test', '--path', workspace,
      ])

      expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Select agent runner:',
        default: 'claude-cli',
      }))
      expect(createRunner).toHaveBeenCalledWith(expect.objectContaining({ type: 'codex-cli' }))
      expect(orchestrator.run).toHaveBeenCalledOnce()
    } finally {
      createRunner.mockRestore()
      loadBacklog.mockRestore()
    }
  })
})

function seedQaRun(workspace: string): void {
  const store = new QaRunStore(workspace)
  const plan: QaPlan = {
    schemaVersion: 1,
    id: 'orders-plan',
    version: 1,
    target: 'http://127.0.0.1:3000',
    profile: 'api',
    createdAt: '2026-09-12T00:00:00.000Z',
    criteria: ['Orders work'],
    scenarios: [
      { id: 'list-orders', description: 'List orders', criterionIds: ['criterion-1'], required: true, profile: 'api', category: 'functional', request: { method: 'GET', path: '/orders', expectedStatus: 200 } },
      { id: 'create-order', description: 'Create order', criterionIds: ['criterion-1'], required: true, profile: 'api', category: 'functional', request: { method: 'POST', path: '/orders', expectedStatus: 201 } },
      { id: 'admin-orders', description: 'Open admin orders', criterionIds: ['criterion-1'], required: true, profile: 'api', category: 'functional', request: { method: 'GET', path: '/admin/orders', expectedStatus: 200 } },
    ],
  }
  const run: QaRun = {
    schemaVersion: 1,
    id: 'orders-run',
    planId: plan.id,
    planVersion: plan.version,
    target: plan.target,
    createdAt: '2026-09-12T00:01:00.000Z',
    completedAt: '2026-09-12T00:02:00.000Z',
    verdict: 'FAIL',
    results: [
      { scenarioId: 'list-orders', required: true, status: 'PASSED', evidence: [] },
      { scenarioId: 'create-order', required: true, status: 'FAILED', reason: 'Expected 201, received 500', evidence: [] },
      { scenarioId: 'admin-orders', required: true, status: 'BLOCKED', reason: 'Connection refused', evidence: [] },
    ],
  }
  store.savePlan(plan)
  store.saveRun(run)
}
