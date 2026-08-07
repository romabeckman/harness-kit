import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { HttpServerError, HttpServerConfig } from '../../domain/types'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import type { HarnessSettingsMap } from '../../../settings/SettingsSchema'
import type { IUpdateSettingsUseCase } from '../ports/inbound/IUpdateSettingsUseCase'
import { Runner } from '../../../agent-runner/types'

const VALID_RUNNERS = Object.values(Runner) as string[]

function isValidRunner(agent?: string): boolean {
  if (!agent || agent.trim() === '') return false
  return VALID_RUNNERS.includes(agent.trim().toLowerCase())
}

export class UpdateSettingsUseCase implements IUpdateSettingsUseCase {
  constructor(private config?: HttpServerConfig) {}

  async execute(
    settingsPayload: HarnessSettingsMap,
    projectIdentifier?: string,
    agentIdentifier?: string
  ): Promise<{ project: string; agent?: string; settings: HarnessSettingsMap }> {
    if (!projectIdentifier || projectIdentifier.trim() === '') {
      throw new HttpServerError(
        400,
        'MISSING_PROJECT_IDENTIFIER',
        `Project identifier parameter 'project' is required in request.`
      )
    }

    if (agentIdentifier && agentIdentifier.trim() !== '') {
      if (!isValidRunner(agentIdentifier)) {
        throw new HttpServerError(
          400,
          'INVALID_AGENT',
          `Agent '${agentIdentifier}' is invalid. Valid agents: ${VALID_RUNNERS.join(', ')}`
        )
      }
    }

    const name = projectIdentifier.trim()
    const fromEnv = DtoMappers.resolveProjectFromEnv(name, this.config?.allowedWorkspaces)
    if (!fromEnv?.path) {
      throw new HttpServerError(
        400,
        'PROJECT_NOT_FOUND',
        `Project identifier '${name}' is not registered in server environment (PROJECT_MAPPINGS, PROJECT_${name.toUpperCase()}_PATH, or ALLOWED_WORKSPACES).`
      )
    }

    const targetPath = resolve(fromEnv.path)

    if (this.config?.allowedWorkspaces && this.config.allowedWorkspaces.length > 0) {
      const allowed = this.config.allowedWorkspaces.some((ws) => targetPath.startsWith(ws))
      if (!allowed) {
        throw new HttpServerError(
          400,
          'PATH_TRAVERSAL_DETECTED',
          `Target path '${targetPath}' is outside allowed workspaces`
        )
      }
    }

    const settingsFilePath = join(targetPath, '.harness-kit', 'settings.json')
    if (!existsSync(dirname(settingsFilePath))) {
      mkdirSync(dirname(settingsFilePath), { recursive: true })
    }

    let existingSettings: HarnessSettingsMap = {}
    if (existsSync(settingsFilePath)) {
      try {
        existingSettings = JSON.parse(readFileSync(settingsFilePath, 'utf-8'))
      } catch {}
    }

    const mergedSettings: HarnessSettingsMap = {
      ...existingSettings,
      ...settingsPayload,
    }

    writeFileSync(settingsFilePath, JSON.stringify(mergedSettings, null, 2), 'utf-8')
    return {
      project: name,
      agent: agentIdentifier ? agentIdentifier.trim().toLowerCase() : undefined,
      settings: mergedSettings,
    }
  }
}
