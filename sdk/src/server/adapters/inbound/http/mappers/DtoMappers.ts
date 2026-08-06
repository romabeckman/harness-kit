import { resolve, isAbsolute, basename } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { OrchestratorConfig } from '../../../../../orchestrator/types'
import { resolveMode } from '../../../../../cli/services/run-service'
import { HttpServerError } from '../../../../domain/types'
import type { RunRequestDtoExtended } from '../dto/RunRequestDto'
import { Runner } from '../../../../../agent-runner/types'

const VALID_RUNNERS = Object.values(Runner) as string[]

function isValidRunner(agent?: string): boolean {
  if (!agent || agent.trim() === '') return false
  return VALID_RUNNERS.includes(agent.trim().toLowerCase())
}

function ensureEnvLoaded(): void {
  const envFile = resolve(process.cwd(), '.env')
  if (!existsSync(envFile)) return

  try {
    const content = readFileSync(envFile, 'utf-8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim()
        let v = trimmed.slice(eqIdx + 1).trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1)
        }
        if (!process.env[k]) {
          process.env[k] = v
        }
      }
    }
  } catch {}
}

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

    const selectedAgent = dto.agent ?? dto.agentType
    if (!selectedAgent || selectedAgent.trim() === '') {
      throw new HttpServerError(
        400,
        'MISSING_AGENT_PARAMETER',
        `Parameter 'agent' (or 'agentType') is required. Valid agents: ${VALID_RUNNERS.join(', ')}`
      )
    }

    if (!isValidRunner(selectedAgent)) {
      throw new HttpServerError(
        400,
        'INVALID_AGENT',
        `Agent '${selectedAgent}' is invalid. Valid agents: ${VALID_RUNNERS.join(', ')}`
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

  static resolveWorkspacePath(dto: RunRequestDtoExtended, allowedWorkspaces?: string[]): string {
    const fromEnv = this.resolveProjectFromEnv(dto.project, allowedWorkspaces)
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
    projectName?: string,
    allowedWorkspaces?: string[]
  ): { path: string; gitUrl?: string } | null {
    ensureEnvLoaded()

    if (!projectName || projectName.trim() === '') return null
    const name = projectName.trim()
    const lowerName = name.toLowerCase()

    const normalize = (p: string) => (isAbsolute(p) ? p : resolve(p))

    // 1. PROJECT_MAPPINGS env var
    if (process.env.PROJECT_MAPPINGS) {
      try {
        let cleanStr = process.env.PROJECT_MAPPINGS.trim()
        const openBraces = (cleanStr.match(/\{/g) || []).length
        let closeBraces = (cleanStr.match(/\}/g) || []).length
        while (closeBraces < openBraces) {
          cleanStr += '}'
          closeBraces++
        }
        const mappings = JSON.parse(cleanStr)
        if (mappings && typeof mappings === 'object') {
          if (mappings[name]) {
            const entry = mappings[name]
            if (typeof entry === 'string') return { path: normalize(entry) }
            if (typeof entry === 'object' && typeof entry.path === 'string') {
              return { path: normalize(entry.path), gitUrl: entry.gitUrl }
            }
          }
          for (const key of Object.keys(mappings)) {
            if (key.toLowerCase() === lowerName) {
              const entry = mappings[key]
              if (typeof entry === 'string') return { path: normalize(entry) }
              if (typeof entry === 'object' && typeof entry.path === 'string') {
                return { path: normalize(entry.path), gitUrl: entry.gitUrl }
              }
            }
          }
        }
      } catch {}
    }

    // 2. PROJECT_<NAME>_PATH env var
    const envPrefix = `PROJECT_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    const pathEnv = process.env[`${envPrefix}_PATH`]
    const gitUrlEnv = process.env[`${envPrefix}_GIT_URL`]

    if (pathEnv) {
      return { path: normalize(pathEnv), gitUrl: gitUrlEnv }
    }

    // 3. Match against allowed workspaces folder basename
    const workspaces = allowedWorkspaces ?? (
      process.env.ALLOWED_WORKSPACES
        ? process.env.ALLOWED_WORKSPACES.split(',').map((p) => p.trim()).filter(Boolean)
        : []
    )

    for (const ws of workspaces) {
      const cleanWs = ws.replace(/^["']|["']$/g, '')
      if (basename(cleanWs).toLowerCase() === lowerName) {
        return { path: resolve(cleanWs) }
      }
    }

    // 4. Match against current working directory basename
    if (basename(process.cwd()).toLowerCase() === lowerName) {
      return { path: resolve(process.cwd()) }
    }

    return null
  }
}
