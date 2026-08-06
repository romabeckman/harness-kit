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
      skill: 'test-driven-development',
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
    expect(result.bySkill['test-driven-development']).toBeDefined()
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
      skill: 'test-driven-development',
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
})
