import { describe, it, expect } from 'vitest'
import { DtoMappers } from '../DtoMappers'
import { HttpServerError } from '../../types'
import { Complexity } from '../../../orchestrator/types'
import type { RunRequestDtoExtended } from '../../dto/RunRequestDto'

describe('DtoMappers Anti-Corruption Layer', () => {
  describe('UT-1.2.6: Refinement Invariant Rejection', () => {
    it('throws HttpServerError(400) with code REFINE_NOT_SUPPORTED_IN_HTTP_MODE when refine is true', () => {
      const payload: RunRequestDtoExtended = {
        scope: 'test-refine',
        refine: true,
      }

      expect(() => DtoMappers.toOrchestratorConfig(payload)).toThrowError(HttpServerError)
      try {
        DtoMappers.toOrchestratorConfig(payload)
      } catch (err: any) {
        expect(err.statusCode).toBe(400)
        expect(err.code).toBe('REFINE_NOT_SUPPORTED_IN_HTTP_MODE')
        expect(err.message).toContain('Interactive refinement (--refine) is forbidden')
      }
    })
  })

  describe('UT-1.2.7: Deep Thinking Mode Rejection', () => {
    it('throws HttpServerError(400) with code INTERACTIVE_MODE_NOT_ALLOWED when mode is deep_thinking', () => {
      const payload: RunRequestDtoExtended = {
        scope: 'complex-refactor',
        mode: 'deep_thinking',
      }

      expect(() => DtoMappers.toOrchestratorConfig(payload)).toThrowError(HttpServerError)
      try {
        DtoMappers.toOrchestratorConfig(payload)
      } catch (err: any) {
        expect(err.statusCode).toBe(400)
        expect(err.code).toBe('INTERACTIVE_MODE_NOT_ALLOWED')
        expect(err.message).toContain("Mode 'deep_thinking' requires interactive TTY prompts")
      }
    })
  })

  describe('UT-1.2.8: Mode to Complexity and Skip Flags Mapping', () => {
    it('maps mode "quick" to Complexity.LOW, skipValidation=true, skipMemory=true, enableRefinement=false', () => {
      const payload: RunRequestDtoExtended = {
        scope: 'quick-feature',
        mode: 'quick',
        skipValidation: true,
      }

      const config = DtoMappers.toOrchestratorConfig(payload)
      expect(config.complexity).toBe(Complexity.LOW)
      expect(config.skipValidation).toBe(true)
      expect(config.skipMemory).toBe(true)
      expect(config.enableRefinement).toBe(false)
    })

    it('maps mode "fast" to Complexity.LOW with default flags', () => {
      const payload: RunRequestDtoExtended = {
        scope: 'fast-feature',
        mode: 'fast',
      }

      const config = DtoMappers.toOrchestratorConfig(payload)
      expect(config.complexity).toBe(Complexity.LOW)
      expect(config.skipValidation).toBe(false)
      expect(config.skipMemory).toBe(false)
      expect(config.enableRefinement).toBe(false)
    })

    it('maps mode "thinking" to Complexity.AUTO', () => {
      const payload: RunRequestDtoExtended = {
        scope: 'thinking-feature',
        mode: 'thinking',
      }

      const config = DtoMappers.toOrchestratorConfig(payload)
      expect(config.complexity).toBe(Complexity.AUTO)
      expect(config.skipValidation).toBe(false)
      expect(config.skipMemory).toBe(false)
      expect(config.enableRefinement).toBe(false)
    })
  })

  describe('UT-1.2.9: Workspace Path Normalization', () => {
    it('normalizes relative workspace paths with dot segments to absolute canonical format', () => {
      const payload: RunRequestDtoExtended = {
        projectPaths: ['./relative/path/../project-a'],
      }

      const resolvedPath = DtoMappers.resolveWorkspacePath(payload)
      expect(resolvedPath).not.toContain('..')
      expect(resolvedPath.endsWith('project-a')).toBe(true)

      const config = DtoMappers.toOrchestratorConfig(payload)
      expect(config.projectPaths[0]).toBe(resolvedPath)
    })

    it('normalizes direct string paths', () => {
      const resolved = DtoMappers.resolveWorkspacePath('./foo/../bar')
      expect(resolved).not.toContain('..')
      expect(resolved.endsWith('bar')).toBe(true)
    })
  })

  describe('UT-1.2.10: Environment Project Mapping', () => {
    it('resolves project name from PROJECT_MAPPINGS JSON env var', () => {
      process.env.PROJECT_MAPPINGS = JSON.stringify({
        backend: { path: '/workspaces/backend-service', gitUrl: 'https://github.com/org/backend.git' },
      })

      const payload: RunRequestDtoExtended = {
        scope: 'test-env-mapping',
        project: 'backend',
      }

      DtoMappers.resolveProjectFromEnv(payload)
      expect(payload.projectPaths?.[0]).toContain('backend-service')
      expect(payload.gitUrl).toBe('https://github.com/org/backend.git')

      delete process.env.PROJECT_MAPPINGS
    })
  })
})
