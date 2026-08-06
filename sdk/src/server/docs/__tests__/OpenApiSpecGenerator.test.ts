import { describe, it, expect } from 'vitest'
import { OpenApiSpecGenerator } from '../OpenApiSpecGenerator'

describe('OpenApiSpecGenerator', () => {
  describe('UT-1.2.5: OpenAPI spec structure and endpoints', () => {
    it('generates valid OpenAPI 3.0.3 specification object', () => {
      const spec = OpenApiSpecGenerator.getSpec()

      expect(spec.openapi).toBe('3.0.3')
      expect(spec.info.title).toContain('Harness-Kit')
      expect(spec.paths).toBeDefined()

      expect(spec.paths['/orchestrator/run']).toBeDefined()
      expect(spec.paths['/orchestrator/status/{id}']).toBeDefined()
      expect(spec.paths['/health']).toBeDefined()
      expect(spec.paths['/docs']).toBeDefined()
      expect(spec.paths['/docs/openapi.json']).toBeDefined()

      const schemas = (spec.components as any).schemas
      expect(schemas).toBeDefined()
      expect(schemas.RunRequestDtoExtended).toBeDefined()
      expect(schemas.RunResponseDto).toBeDefined()
      expect(schemas.JobStatusDto).toBeDefined()
      expect(schemas.HealthStatusVo).toBeDefined()
    })

    it('generates self-contained Swagger UI HTML string referencing /docs/openapi.json', () => {
      const html = OpenApiSpecGenerator.getSwaggerHtml()

      expect(typeof html).toBe('string')
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('swagger-ui')
      expect(html).toContain('/docs/openapi.json')
    })
  })
})
