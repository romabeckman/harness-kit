import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GetTokensTelemetryUseCase } from '../GetTokensTelemetryUseCase'
import { HttpServerError } from '../../../domain/types'

describe('GetTokensTelemetryUseCase', () => {
  const testWorkspaceDir = join(process.cwd(), 'tests', '.temp', 'telemetry-use-case-test')
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

  it('loads tokens.jsonl and returns TokenReport DTO', async () => {
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: testWorkspaceDir,
    })

    const productDir = join(testWorkspaceDir, 'docs', 'product')
    mkdirSync(productDir, { recursive: true })
    const tokensFile = join(productDir, 'tokens.jsonl')
    const sampleEntry = JSON.stringify({
      ts: '2026-08-06T12:00:00.000Z',
      skill: 'tdd-orchestrator',
      agent: 'claude-cli',
      model: 'claude-3-5-sonnet',
      effort: 'medium',
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 10,
      cacheReadTokens: 5,
      costUsd: 0.002,
    }) + '\n'

    writeFileSync(tokensFile, sampleEntry, 'utf-8')

    const useCase = new GetTokensTelemetryUseCase()
    const result = await useCase.execute('backend')

    expect(result.project).toBe('backend')
    expect(result.entries.length).toBe(1)
    expect(result.totals.inputTokens).toBe(100)
    expect(result.totals.outputTokens).toBe(50)
    expect(result.bySkill['tdd-orchestrator']).toBeDefined()
  })

  it('filters token entries by jobId when jobId parameter is specified', async () => {
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: testWorkspaceDir,
    })

    const targetJobId = 'job-123-abc'
    const wtDir = join(testWorkspaceDir, '.worktrees', targetJobId, 'docs', 'product')
    mkdirSync(wtDir, { recursive: true })
    const tokensFile = join(wtDir, 'tokens.jsonl')
    const sampleEntry = JSON.stringify({
      ts: '2026-08-06T12:00:00.000Z',
      skill: 'tdd-orchestrator',
      agent: 'claude-cli',
      model: 'claude-3-5-sonnet',
      effort: 'medium',
      jobId: targetJobId,
      inputTokens: 200,
      outputTokens: 80,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0.004,
    }) + '\n'

    writeFileSync(tokensFile, sampleEntry, 'utf-8')

    const useCase = new GetTokensTelemetryUseCase()
    const result = await useCase.execute('backend', targetJobId)

    expect(result.project).toBe('backend')
    expect(result.jobId).toBe(targetJobId)
    expect(result.entries.length).toBe(1)
    expect(result.totals.inputTokens).toBe(200)

    const emptyResult = await useCase.execute('backend', 'non-existent-job')
    expect(emptyResult.entries.length).toBe(0)
    expect(emptyResult.totals.inputTokens).toBe(0)
  })

  it('throws HttpServerError(400, MISSING_PROJECT_PARAMETER) when project parameter is missing', async () => {
    const useCase = new GetTokensTelemetryUseCase()
    await expect(useCase.execute()).rejects.toThrowError(HttpServerError)
  })

  it('throws HttpServerError(400, PROJECT_NOT_FOUND) when project is not registered in environment', async () => {
    const useCase = new GetTokensTelemetryUseCase()
    await expect(useCase.execute('unknown-project')).rejects.toThrowError(HttpServerError)
  })

  it('supports filtering by startDate, endDate, model and paginating with limit and nextToken', async () => {
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: testWorkspaceDir,
    })

    const productDir = join(testWorkspaceDir, 'docs', 'product')
    mkdirSync(productDir, { recursive: true })
    const tokensFile = join(productDir, 'tokens.jsonl')

    const entry1 = JSON.stringify({
      auditId: 'aud_1',
      projectId: 'backend',
      timestamp: '2026-08-01T10:00:00.000Z',
      agent: 'claude-cli',
      model: 'claude-3-5-sonnet',
      skill: 'tdd-orchestrator',
      executionMetrics: { durationMs: 1000, status: 'success' },
      tokenUsage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0, calculatedCostUsd: 0.001 },
    })

    const entry2 = JSON.stringify({
      auditId: 'aud_2',
      projectId: 'backend',
      timestamp: '2026-08-07T10:00:00.000Z',
      agent: 'claude-cli',
      model: 'claude-3-5-sonnet',
      skill: 'tdd-orchestrator',
      executionMetrics: { durationMs: 2000, status: 'success' },
      tokenUsage: { inputTokens: 200, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0, calculatedCostUsd: 0.002 },
    })

    const entry3 = JSON.stringify({
      auditId: 'aud_3',
      projectId: 'backend',
      timestamp: '2026-08-07T12:00:00.000Z',
      agent: 'codex-cli',
      model: 'gpt-4o',
      skill: 'autonomous-orchestrator',
      executionMetrics: { durationMs: 3000, status: 'success' },
      tokenUsage: { inputTokens: 300, outputTokens: 150, cacheCreationTokens: 0, cacheReadTokens: 0, calculatedCostUsd: 0.003 },
    })

    writeFileSync(tokensFile, `${entry1}\n${entry2}\n${entry3}\n`, 'utf-8')

    const useCase = new GetTokensTelemetryUseCase()

    // Filter by model & date
    const page1 = await useCase.execute('backend', undefined, {
      startDate: '2026-08-05T00:00:00.000Z',
      endDate: '2026-08-08T00:00:00.000Z',
      model: 'claude-3-5-sonnet',
      limit: 1,
    })

    expect(page1.entries.length).toBe(1)
    expect(page1.entries[0].auditId).toBe('aud_2')
    expect(page1.totals.inputTokens).toBe(200) // Accumulated total in period matching filters
    expect(page1.pagination?.hasMore).toBe(false)

    // Pagination across all matching date
    const p1 = await useCase.execute('backend', undefined, {
      startDate: '2026-08-05T00:00:00.000Z',
      limit: 1,
    })

    expect(p1.entries.length).toBe(1)
    expect(p1.pagination?.hasMore).toBe(true)
    expect(p1.pagination?.nextToken).toBeDefined()

    const p2 = await useCase.execute('backend', undefined, {
      startDate: '2026-08-05T00:00:00.000Z',
      limit: 1,
      nextToken: p1.pagination?.nextToken,
    })

    expect(p2.entries.length).toBe(1)
    expect(p2.entries[0].auditId).toBe('aud_3')
    expect(p2.totals.inputTokens).toBe(500) // 200 + 300 total in period
  })
})

