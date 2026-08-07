import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DtoMappers } from '../DtoMappers'
import { HttpServerError } from '../../../../../domain/types'
import { RunMode } from '../../../../../../orchestrator/types'

describe('DtoMappers Anti-Corruption Layer (ACL)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.PROJECT_MAPPINGS
    delete process.env.PROJECT_BACKEND_PATH
    delete process.env.PROJECT_BACKEND_GIT_URL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('UT-1.2.6: Rejects refine with HttpServerError(400)', () => {
    expect(() =>
      DtoMappers.toOrchestratorConfig({ scope: 'test', agent: 'claude-cli', refine: true } as any)
    ).toThrowError(HttpServerError)

    try {
      DtoMappers.toOrchestratorConfig({ scope: 'test', agent: 'claude-cli', refine: true } as any)
    } catch (err: any) {
      expect(err.statusCode).toBe(400)
      expect(err.code).toBe('REFINE_NOT_ALLOWED')
    }
  })

  it('UT-1.2.7: Rejects mode: "deep_thinking" with HttpServerError(400)', () => {
    expect(() =>
      DtoMappers.toOrchestratorConfig({ scope: 'test', mode: RunMode.DEEP_THINKING })
    ).toThrowError(HttpServerError)

    try {
      DtoMappers.toOrchestratorConfig({ scope: 'test', mode: RunMode.DEEP_THINKING })
    } catch (err: any) {
      expect(err.statusCode).toBe(400)
      expect(err.code).toBe('INTERACTIVE_MODE_NOT_ALLOWED')
    }
  })

  it('UT-1.2.8: Maps mode ("quick", "fast", "thinking") to OrchestratorConfig using resolveMode', () => {
    process.env.PROJECT_BACKEND_PATH = '/tmp/backend'
    const quickConfig = DtoMappers.toOrchestratorConfig({ scope: 'quick-test', project: 'backend', agent: 'claude-cli', mode: 'quick' })
    expect(quickConfig.skipValidation).toBe(true)
    expect(quickConfig.skipMemory).toBe(true)

    const fastConfig = DtoMappers.toOrchestratorConfig({ scope: 'fast-test', project: 'backend', agent: 'claude-cli', mode: 'fast' })
    expect(fastConfig.complexity).toBe('LOW')
    expect(fastConfig.skipValidation).toBe(false)
  })

  it('UT-1.2.9: Normalizes workspace paths from project list', () => {
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      src: './src',
      other: './other',
    })
    const resolvedPath = DtoMappers.resolveWorkspacePath({ project: ['src'] })
    expect(resolvedPath).toContain('src')
    expect(resolvedPath.length).toBeGreaterThan(5)

    const resolvedPaths = DtoMappers.resolveWorkspacePaths({ project: ['src', 'other'] })
    expect(resolvedPaths.length).toBe(2)
    expect(resolvedPaths[0]).toContain('src')
    expect(resolvedPaths[1]).toContain('other')
  })

  it('Rejects missing or empty project parameter with HttpServerError(400)', () => {
    expect(() =>
      DtoMappers.toOrchestratorConfig({ scope: 'test', agent: 'claude-cli' })
    ).toThrowError(HttpServerError)

    expect(() =>
      DtoMappers.resolveWorkspacePaths({ project: [] })
    ).toThrowError(HttpServerError)

    try {
      DtoMappers.resolveWorkspacePaths({ project: [] })
    } catch (err: any) {
      expect(err.statusCode).toBe(400)
      expect(err.code).toBe('MISSING_PROJECT_PARAMETER')
    }
  })

  it('UT-1.2.10: Resolves project alias from environment variables', () => {
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: { path: '/workspaces/backend-repo', gitUrl: 'https://github.com/org/backend.git' },
    })

    const envResolved = DtoMappers.resolveProjectFromEnv('backend')
    expect(envResolved).not.toBeNull()
    expect(envResolved?.path).toBe('/workspaces/backend-repo')
    expect(envResolved?.gitUrl).toBe('https://github.com/org/backend.git')
  })

  it('UT-1.2.11: Resolves baseBranch from PROJECT_MAPPINGS or PROJECT_<NAME>_BASE_BRANCH env var', () => {
    process.env.PROJECT_MAPPINGS = JSON.stringify({
      backend: { path: '/workspaces/backend-repo', gitUrl: 'https://github.com/org/backend.git', baseBranch: 'develop' },
    })

    const envResolved = DtoMappers.resolveProjectFromEnv('backend')
    expect(envResolved?.baseBranch).toBe('develop')

    delete process.env.PROJECT_MAPPINGS
    process.env.PROJECT_FRONTEND_PATH = '/workspaces/frontend'
    process.env.PROJECT_FRONTEND_BASE_BRANCH = 'release/v1.0'

    const envPrefixResolved = DtoMappers.resolveProjectFromEnv('frontend')
    expect(envPrefixResolved?.baseBranch).toBe('release/v1.0')
  })
})
