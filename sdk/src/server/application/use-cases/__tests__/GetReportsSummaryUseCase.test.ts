import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GetReportsSummaryUseCase } from '../GetReportsSummaryUseCase'
import { HttpServerError } from '../../../domain/types'

describe('GetReportsSummaryUseCase', () => {
  const testWorkspaceDir = join(process.cwd(), 'tests', '.temp', 'reports-summary-use-case-test')
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.PROJECT_MAPPINGS

    if (existsSync(testWorkspaceDir)) {
      rmSync(testWorkspaceDir, { recursive: true, force: true })
    }
    mkdirSync(testWorkspaceDir, { recursive: true })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    if (existsSync(testWorkspaceDir)) {
      rmSync(testWorkspaceDir, { recursive: true, force: true })
    }
  })

  it('aggregates cost, tokens, and invocations by project, model, and agent', async () => {
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: testWorkspaceDir,
    })

    const productDir = join(testWorkspaceDir, 'docs', 'product')
    mkdirSync(productDir, { recursive: true })
    const tokensFile = join(productDir, 'tokens.jsonl')

    const entry1 = JSON.stringify({
      auditId: 'aud_1',
      jobId: 'job-1',
      projectId: 'backend',
      tenantId: 'org_corp',
      userId: 'usr_1',
      timestamp: '2026-08-07T10:00:00.000Z',
      agent: 'claude-cli',
      model: 'claude-3-5-sonnet',
      skill: 'tdd-orchestrator',
      executionMetrics: { durationMs: 4000, status: 'success' },
      tokenUsage: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 100,
        cacheReadTokens: 400,
        calculatedCostUsd: 0.005,
      },
    })

    const entry2 = JSON.stringify({
      auditId: 'aud_2',
      jobId: 'job-2',
      projectId: 'backend',
      tenantId: 'org_corp',
      userId: 'usr_2',
      timestamp: '2026-08-07T11:00:00.000Z',
      agent: 'codex-cli',
      model: 'gpt-4o',
      skill: 'autonomous-orchestrator',
      executionMetrics: { durationMs: 2000, status: 'success' },
      tokenUsage: {
        inputTokens: 2000,
        outputTokens: 1000,
        cacheCreationTokens: 200,
        cacheReadTokens: 800,
        calculatedCostUsd: 0.01,
      },
    })

    writeFileSync(tokensFile, `${entry1}\n${entry2}\n`, 'utf-8')

    const useCase = new GetReportsSummaryUseCase()
    const result = await useCase.execute('backend', '2026-08-07T00:00:00.000Z', '2026-08-07T23:59:59.000Z')

    expect(result.summary.byProject.backend).toBeDefined()
    expect(result.summary.byProject.backend.totalInvocations).toBe(2)
    expect(result.summary.byProject.backend.inputTokens).toBe(3000)
    expect(result.summary.byProject.backend.totalCostUsd).toBeCloseTo(0.015)

    expect(result.summary.byModel['claude-3-5-sonnet']).toBeDefined()
    expect(result.summary.byModel['claude-3-5-sonnet'].totalInvocations).toBe(1)

    expect(result.summary.byAgent['claude-cli']).toBeDefined()
    expect(result.summary.byAgent['codex-cli']).toBeDefined()

    expect(result.grandTotal.totalInvocations).toBe(2)
    expect(result.grandTotal.inputTokens).toBe(3000)
    expect(result.grandTotal.totalCostUsd).toBeCloseTo(0.015)
  })

  it('filters summary entries by date range', async () => {
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: testWorkspaceDir,
    })

    const productDir = join(testWorkspaceDir, 'docs', 'product')
    mkdirSync(productDir, { recursive: true })
    const tokensFile = join(productDir, 'tokens.jsonl')

    const entry1 = JSON.stringify({
      auditId: 'aud_1',
      jobId: 'job-1',
      projectId: 'backend',
      timestamp: '2026-08-01T10:00:00.000Z',
      agent: 'claude-cli',
      model: 'claude-3-5-sonnet',
      skill: 'tdd-orchestrator',
      executionMetrics: { durationMs: 4000, status: 'success' },
      tokenUsage: { inputTokens: 1000, outputTokens: 500, cacheCreationTokens: 0, cacheReadTokens: 0, calculatedCostUsd: 0.005 },
    })

    const entry2 = JSON.stringify({
      auditId: 'aud_2',
      jobId: 'job-2',
      projectId: 'backend',
      timestamp: '2026-08-07T11:00:00.000Z',
      agent: 'claude-cli',
      model: 'claude-3-5-sonnet',
      skill: 'tdd-orchestrator',
      executionMetrics: { durationMs: 2000, status: 'success' },
      tokenUsage: { inputTokens: 2000, outputTokens: 1000, cacheCreationTokens: 0, cacheReadTokens: 0, calculatedCostUsd: 0.01 },
    })

    writeFileSync(tokensFile, `${entry1}\n${entry2}\n`, 'utf-8')

    const useCase = new GetReportsSummaryUseCase()
    const result = await useCase.execute('backend', '2026-08-05T00:00:00.000Z', '2026-08-08T23:59:59.000Z')

    expect(result.grandTotal.totalInvocations).toBe(1)
    expect(result.grandTotal.inputTokens).toBe(2000)
  })
})
