import { describe, it, expect, beforeEach } from 'vitest'
import { RunOrchestratorJobUseCase } from '../RunOrchestratorJobUseCase'
import { InMemoryJobStore } from '../../repository/InMemoryJobStore'
import { JobQueue } from '../../queue/JobQueue'
import { HttpServerError } from '../../types'

describe('RunOrchestratorJobUseCase', () => {
  let jobStore: InMemoryJobStore
  let jobQueue: JobQueue
  let useCase: RunOrchestratorJobUseCase

  beforeEach(() => {
    jobStore = new InMemoryJobStore()
    jobQueue = new JobQueue()
    useCase = new RunOrchestratorJobUseCase(jobStore, jobQueue)
  })

  it('enqueues job and returns RunResponseDto with HTTP 202 structure', async () => {
    const res = await useCase.execute({ scope: 'use-case-test', mode: 'fast' })
    expect(res.jobId).toBeDefined()
    expect(res.status).toBe('queued')
    expect(res.statusUrl).toBe(`/orchestrator/status/${res.jobId}`)

    const storedJob = await jobStore.findById(res.jobId)
    expect(storedJob).not.toBeNull()
    expect(jobQueue.size).toBe(1)
  })

  it('throws HttpServerError(400) when refine is true', async () => {
    await expect(useCase.execute({ scope: 'refine-test', refine: true })).rejects.toThrowError(HttpServerError)
  })

  it('throws HttpServerError(400) when mode is deep_thinking', async () => {
    await expect(useCase.execute({ scope: 'deep-test', mode: 'deep_thinking' })).rejects.toThrowError(HttpServerError)
  })

  it('throws HttpServerError(400) when path traversal detected', async () => {
    await expect(useCase.execute({ scope: 'traversal-test', projectPaths: ['../secret'] })).rejects.toThrowError(HttpServerError)
  })
})
