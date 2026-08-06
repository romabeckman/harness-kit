import { describe, it, expect } from 'vitest'
import { GetHealthStatusUseCase } from '../GetHealthStatusUseCase'
import { GetOpenApiDocsUseCase } from '../GetOpenApiDocsUseCase'
import { InMemoryJobStore } from '../../../adapters/outbound/repository/InMemoryJobStore'
import { JobQueue } from '../../../adapters/outbound/queue/JobQueue'

describe('Server Use Cases', () => {
  describe('GetHealthStatusUseCase', () => {
    it('returns HealthStatusVo with system metrics', async () => {
      const jobStore = new InMemoryJobStore()
      const jobQueue = new JobQueue()
      const useCase = new GetHealthStatusUseCase(jobStore, jobQueue)

      const health = await useCase.execute()
      expect(health.status).toBe('healthy')
      expect(typeof health.uptimeSeconds).toBe('number')
      expect(health.activeJobs).toBe(0)
      expect(health.queuedJobs).toBe(0)
      expect(health.memoryUsage).toBeDefined()
    })
  })

  describe('GetOpenApiDocsUseCase', () => {
    it('returns OpenAPI 3.0 spec object and Swagger UI HTML', () => {
      const useCase = new GetOpenApiDocsUseCase()
      const spec = useCase.getSpec()
      const html = useCase.getSwaggerHtml()

      expect(spec.openapi).toBe('3.0.3')
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('swagger-ui')
    })
  })
})
