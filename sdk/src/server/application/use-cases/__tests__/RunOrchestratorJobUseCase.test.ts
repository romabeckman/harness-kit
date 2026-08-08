import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RunOrchestratorJobUseCase } from '../RunOrchestratorJobUseCase'
import { InMemoryJobStore } from '../../../adapters/outbound/repository/InMemoryJobStore'
import { JobQueue } from '../../../adapters/outbound/queue/JobQueue'
import { HttpServerError } from '../../../domain/types'

describe('RunOrchestratorJobUseCase', () => {
  let jobStore: InMemoryJobStore
  let jobQueue: JobQueue
  let useCase: RunOrchestratorJobUseCase
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: process.cwd(),
    })
    jobStore = new InMemoryJobStore()
    jobQueue = new JobQueue()
    useCase = new RunOrchestratorJobUseCase(jobStore, jobQueue)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('enqueues job and returns RunResponseDto with HTTP 202 structure', async () => {
    const res = await useCase.execute({ scope: 'use-case-test', project: 'backend', agent: 'claude-cli', mode: 'fast', idempotencyKey: 'idem-uc-1' })
    expect(res.jobId).toBeDefined()
    expect(res.status).toBe('queued')
    expect(res.statusUrl).toBe(`/orchestrator/status/${res.jobId}`)

    const storedJob = await jobStore.findById(res.jobId)
    expect(storedJob).not.toBeNull()
    expect(storedJob?.idempotencyKey).toBe('idem-uc-1')
    expect(jobQueue.size).toBe(1)
  })

  it('throws HttpServerError(409 DUPLICATE_IDEMPOTENCY_KEY) when duplicate idempotencyKey is submitted', async () => {
    await useCase.execute({ scope: 'first-req', project: 'backend', agent: 'claude-cli', idempotencyKey: 'dup-idem-key' })

    await expect(
      useCase.execute({ scope: 'second-req', project: 'backend', agent: 'claude-cli', idempotencyKey: 'dup-idem-key' })
    ).rejects.toThrowError(HttpServerError)

    try {
      await useCase.execute({ scope: 'second-req', project: 'backend', agent: 'claude-cli', idempotencyKey: 'dup-idem-key' })
    } catch (err: any) {
      expect(err.statusCode).toBe(409)
      expect(err.code).toBe('DUPLICATE_IDEMPOTENCY_KEY')
    }
  })

  it('throws HttpServerError(400) when refine is passed', async () => {
    await expect(useCase.execute({ scope: 'refine-test', project: 'backend', agent: 'claude-cli', refine: true } as any)).rejects.toThrowError(HttpServerError)
  })

  it('throws HttpServerError(400) when mode is deep_thinking', async () => {
    await expect(useCase.execute({ scope: 'deep-test', project: 'backend', agent: 'claude-cli', mode: 'deep_thinking' } as any)).rejects.toThrowError(HttpServerError)
  })

  it('throws HttpServerError(400) when path traversal detected in project', async () => {
    await expect(useCase.execute({ scope: 'traversal-test', project: ['../secret'], agent: 'claude-cli' } as any)).rejects.toThrowError(HttpServerError)
  })

  it('throws HttpServerError(400) when project parameter is missing or empty', async () => {
    await expect(useCase.execute({ scope: 'no-proj-test', agent: 'claude-cli' } as any)).rejects.toThrowError(HttpServerError)
  })
})
