import { describe, it, expect } from 'vitest'
import { OpenApiSpecGenerator } from '../OpenApiSpecGenerator'

describe('OpenApiSpecGenerator', () => {
  it('UT-1.2.5: Generates valid OpenAPI 3.0.3 spec object', () => {
    const spec = OpenApiSpecGenerator.getSpec()
    expect(spec.openapi).toBe('3.0.3')
    expect(spec.info.title).toContain('Harness-Kit')
    expect(spec.tags).toHaveLength(5)

    // Verify all routes are defined in paths
    expect(spec.paths['/orchestrator/run']).toBeDefined()
    expect(spec.paths['/orchestrator/jobs/{id}/resume']).toBeDefined()
    expect(spec.paths['/orchestrator/status/{id}']).toBeDefined()
    expect(spec.paths['/orchestrator/jobs/clean']).toBeDefined()
    expect(spec.paths['/orchestrator/sync']).toBeDefined()
    expect(spec.paths['/orchestrator/webhook/sync']).toBeDefined()
    expect(spec.paths['/orchestrator/settings']).toBeDefined()
    expect(spec.paths['/orchestrator/tokens']).toBeDefined()
    expect(spec.paths['/orchestrator/telemetry/tokens']).toBeDefined()
    expect(spec.paths['/orchestrator/reports/summary']).toBeDefined()
    expect(spec.paths['/health']).toBeDefined()
    expect(spec.paths['/docs']).toBeDefined()
    expect(spec.paths['/docs/openapi.json']).toBeDefined()

    // Verify component schemas exist
    const schemas = (spec as any).components.schemas
    expect(schemas.RunRequestDtoExtended).toBeDefined()
    expect(schemas.RunResponseDto).toBeDefined()
    expect(schemas.JobStatusDto).toBeDefined()
    expect(schemas.SyncWorkspaceRequestDto).toBeDefined()
    expect(schemas.SyncWorkspaceResponseDto).toBeDefined()
    expect(schemas.CleanResultVo).toBeDefined()
    expect(schemas.PhaseSettings).toBeDefined()
    expect(schemas.RunnerSettings).toBeDefined()
    expect(schemas.HarnessSettingsMap).toBeDefined()
    expect(schemas.SettingsResponseDto).toBeDefined()
    expect(schemas.UpdateSettingsRequestDto).toBeDefined()
    expect(schemas.TokensTelemetryDto).toBeDefined()
    expect(schemas.ReportsSummaryDto).toBeDefined()
    expect(schemas.HealthStatusVo).toBeDefined()
    expect(schemas.HttpServerError).toBeDefined()

    const updateSettingsSchema = schemas.UpdateSettingsRequestDto
    expect(updateSettingsSchema.required).toEqual(['project', 'agent'])
    expect(updateSettingsSchema.properties.project).toBeDefined()
    expect(updateSettingsSchema.properties.agent).toBeDefined()
    expect(updateSettingsSchema.properties.timeoutMs).toBeDefined()
    expect(updateSettingsSchema.properties.model).toBeDefined()
    expect(updateSettingsSchema.properties.effort).toBeDefined()
    expect(updateSettingsSchema.properties.phases).toBeDefined()

    const schema = schemas.RunRequestDtoExtended
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

