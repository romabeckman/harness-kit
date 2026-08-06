import { describe, it, expect } from 'vitest'
import { OpenApiSpecGenerator } from '../OpenApiSpecGenerator'

describe('OpenApiSpecGenerator', () => {
  it('UT-1.2.5: Generates valid OpenAPI 3.0.3 spec object', () => {
    const spec = OpenApiSpecGenerator.getSpec()
    expect(spec.openapi).toBe('3.0.3')
    expect(spec.info.title).toContain('Harness-Kit')
    expect(spec.paths['/orchestrator/run']).toBeDefined()
    expect(spec.paths['/health']).toBeDefined()
  })

  it('Generates Swagger UI HTML template', () => {
    const html = OpenApiSpecGenerator.getSwaggerHtml()
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('swagger-ui')
  })
})
