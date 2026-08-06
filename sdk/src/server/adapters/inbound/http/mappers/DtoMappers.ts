import { resolve, isAbsolute } from 'node:path'
import type { OrchestratorConfig } from '../../../../../orchestrator/types'
import { resolveMode } from '../../../../../cli/services/run-service'
import { HttpServerError } from '../../../../domain/types'
import type { RunRequestDtoExtended } from '../dto/RunRequestDto'

export class DtoMappers {
  static toOrchestratorConfig(
    dto: RunRequestDtoExtended,
    overrideWorkspacePath?: string
  ): OrchestratorConfig {
    if (dto.refine === true) {
      throw new HttpServerError(
        400,
        'REFINE_NOT_SUPPORTED_IN_HTTP_MODE',
        'Interactive mode refine=true is strictly prohibited in HTTP daemon execution.'
      )
    }

    if (dto.mode === 'deep_thinking') {
      throw new HttpServerError(
        400,
        'INTERACTIVE_MODE_NOT_ALLOWED',
        'Interactive mode deep_thinking is not allowed in background HTTP execution.'
      )
    }

    const resolvedWorkspace = overrideWorkspacePath
      ? resolve(overrideWorkspacePath)
      : this.resolveWorkspacePath(dto)

    const rawMode = dto.mode ?? 'quick'
    const modeConfig = resolveMode(rawMode as any)

    return {
      scope: dto.scope ?? '',
      projectPaths: [resolvedWorkspace],
      complexity: modeConfig.complexity,
      reworks: dto.reworks ?? 1,
      steeringMessage: dto.steeringMessage,
      skipValidation: dto.skipValidation ?? modeConfig.skipValidation,
      skipMemory: dto.skipMemory ?? modeConfig.skipMemory,
      skipDeploy: dto.skipDeploy ?? false,
      enableRefinement: false,
    }
  }

  static resolveWorkspacePath(dto: RunRequestDtoExtended): string {
    const fromEnv = this.resolveProjectFromEnv(dto.project)
    if (fromEnv?.path) {
      return resolve(fromEnv.path)
    }

    if (dto.projectPaths && dto.projectPaths.length > 0) {
      const target = dto.projectPaths[0]
      if (typeof target === 'string' && target.trim() !== '') {
        return isAbsolute(target) ? target : resolve(process.cwd(), target)
      }
    }
    return process.cwd()
  }

  static resolveProjectFromEnv(
    projectName?: string
  ): { path: string; gitUrl?: string } | null {
    if (!projectName || projectName.trim() === '') return null
    const name = projectName.trim()

    if (process.env.PROJECT_MAPPINGS) {
      try {
        const mappings = JSON.parse(process.env.PROJECT_MAPPINGS)
        if (mappings && typeof mappings === 'object' && mappings[name]) {
          const entry = mappings[name]
          if (typeof entry === 'string') {
            return { path: entry }
          }
          if (typeof entry === 'object' && typeof entry.path === 'string') {
            return { path: entry.path, gitUrl: entry.gitUrl }
          }
        }
      } catch {}
    }

    const envPrefix = `PROJECT_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    const pathEnv = process.env[`${envPrefix}_PATH`]
    const gitUrlEnv = process.env[`${envPrefix}_GIT_URL`]

    if (pathEnv) {
      return { path: pathEnv, gitUrl: gitUrlEnv }
    }

    return null
  }
}
