import { describe, it, expect } from 'vitest'
import { OpenApiSpecGenerator } from '../OpenApiSpecGenerator'

describe('OpenApiSpecGenerator', () => {
  it('UT-1.2.5: Generates valid OpenAPI 3.0.3 spec object', () => {
    const spec = OpenApiSpecGenerator.getSpec()
    expect(spec.openapi).toBe('3.0.3')
    expect(spec.info.title).toContain('Harness-Kit')
    expect(spec.paths['/orchestrator/run']).toBeDefined()
    expect(spec.paths['/orchestrator/webhook/sync']).toBeDefined()
    expect(spec.paths['/health']).toBeDefined()

    const schema = (spec as any).components.schemas.RunRequestDtoExtended
    expect(schema.required).toEqual(['idempotencyKey', 'scope', 'project', 'agent'])
    expect(schema.properties.branch).toBeUndefined()
    expect(schema.properties.skipDeploy).toBeUndefined()
    expect(schema.properties.baseBranch).toBeUndefined()
    expect(schema.properties.useWorktree).toBeUndefined()
  })

  it('Generates Swagger UI HTML template', () => {
    const html = OpenApiSpecGenerator.getSwaggerHtml()
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('swagger-ui')
  })
})
