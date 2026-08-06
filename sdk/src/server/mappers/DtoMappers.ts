import { resolve } from 'path'
import { HttpServerError } from '../types'
import type { RunRequestDtoExtended } from '../dto/RunRequestDto'
import { RunMode } from '../../orchestrator/types'
import type { OrchestratorConfig } from '../../orchestrator/types'
import { resolveMode } from '../../cli/services/run-service'

export class DtoMappers {
  /**
   * Normalizes a workspace path or array of paths to absolute canonical format.
   * If baseDir is provided, relative paths resolve against baseDir; otherwise process.cwd().
   */
  static resolveWorkspacePath(pathOrPayload: string | RunRequestDtoExtended, baseDir?: string): string {
    let targetPath: string
    if (typeof pathOrPayload === 'string') {
      targetPath = pathOrPayload
    } else {
      this.resolveProjectFromEnv(pathOrPayload)
      targetPath =
        pathOrPayload.projectPaths && pathOrPayload.projectPaths.length > 0
          ? pathOrPayload.projectPaths[0]
          : '.'
    }
    const root = baseDir ?? process.cwd()
    return resolve(root, targetPath)
  }

  static resolveWorkspacePaths(dto: RunRequestDtoExtended, baseDir?: string): string[] {
    this.resolveProjectFromEnv(dto)
    const root = baseDir ?? process.cwd()
    if (!dto.projectPaths || dto.projectPaths.length === 0) {
      return [resolve(root)]
    }
    return dto.projectPaths.map((p) => resolve(root, p))
  }

  /**
   * Resolves project alias (e.g. "backend") from env vars (PROJECT_MAPPINGS JSON or PROJECT_<NAME>_PATH).
   */
  static resolveProjectFromEnv(dto: RunRequestDtoExtended): void {
    if (!dto.project) return

    const name = dto.project.trim()
    const envJson = process.env.PROJECT_MAPPINGS
    if (envJson) {
      try {
        const mappings = JSON.parse(envJson)
        const projectConfig = mappings[name] || mappings[name.toLowerCase()]
        if (projectConfig) {
          const path = typeof projectConfig === 'string' ? projectConfig : projectConfig.path
          const gitUrl = typeof projectConfig === 'object' ? projectConfig.gitUrl : undefined
          if (path) dto.projectPaths = [path]
          if (gitUrl && !dto.gitUrl) dto.gitUrl = gitUrl
          return
        }
      } catch {}
    }

    const envName = name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    const envPath = process.env[`PROJECT_${envName}_PATH`]
    const envGitUrl = process.env[`PROJECT_${envName}_GIT_URL`]
    if (envPath) {
      dto.projectPaths = [envPath]
      if (envGitUrl && !dto.gitUrl) dto.gitUrl = envGitUrl
    }
  }

  /**
   * Maps a RunRequestDtoExtended to domain OrchestratorConfig while enforcing non-interactive HTTP mode invariants.
   * Throws HttpServerError(400) if refine: true or mode: 'deep_thinking'.
   */
  static toOrchestratorConfig(dto: RunRequestDtoExtended, defaultWorkspace?: string): OrchestratorConfig {
    // UT-1.2.6: Refinement Invariant Rejection
    if (dto.refine === true) {
      throw new HttpServerError(
        400,
        'REFINE_NOT_SUPPORTED_IN_HTTP_MODE',
        'Interactive refinement (--refine) is forbidden in HTTP server background execution.'
      )
    }

    // UT-1.2.7: Deep Thinking Mode Rejection
    if (dto.mode === 'deep_thinking' || (dto.mode as string) === RunMode.DEEP_THINKING) {
      throw new HttpServerError(
        400,
        'INTERACTIVE_MODE_NOT_ALLOWED',
        "Mode 'deep_thinking' requires interactive TTY prompts and is dis-allowed in HTTP daemon mode."
      )
    }

    // Convert raw string mode to RunMode enum if present
    let runMode: RunMode | undefined
    if (dto.mode) {
      const modeLower = dto.mode.toLowerCase()
      if (modeLower === RunMode.QUICK) runMode = RunMode.QUICK
      else if (modeLower === RunMode.FAST) runMode = RunMode.FAST
      else if (modeLower === RunMode.THINKING) runMode = RunMode.THINKING
      else if (modeLower === RunMode.DEEP_THINKING) runMode = RunMode.DEEP_THINKING
    }

    // UT-1.2.8: Use resolveMode to map mode to complexity & skip flags
    const modeConfig = resolveMode(runMode)

    const projectPaths = this.resolveWorkspacePaths(dto, defaultWorkspace)

    return {
      scope: dto.scope ?? '',
      score: dto.score,
      reworks: dto.reworks,
      projectPaths,
      complexity: modeConfig.complexity,
      skipValidation: modeConfig.skipValidation || !!dto.skipValidation,
      skipMemory: modeConfig.skipMemory || !!dto.skipMemory,
      skipDeploy: !!dto.skipDeploy,
      enableRefinement: false, // strictly false in HTTP non-interactive mode
      initialRules: dto.steeringMessage,
    }
  }
}
