import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HarnessSettings } from '../../../settings/HarnessSettings'
import { DEFAULT_SETTINGS } from '../../../settings/DefaultSettings'
import type { HarnessSettingsMap } from '../../../settings/SettingsSchema'
import { HttpServerError, HttpServerConfig } from '../../domain/types'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import type { IGetSettingsUseCase } from '../ports/inbound/IGetSettingsUseCase'
import { Runner } from '../../../agent-runner/types'

const VALID_RUNNERS = Object.values(Runner) as string[]

function isValidRunner(agent?: string): boolean {
  if (!agent || agent.trim() === '') return false
  return VALID_RUNNERS.includes(agent.trim().toLowerCase())
}

export class GetSettingsUseCase implements IGetSettingsUseCase {
  constructor(private config?: HttpServerConfig) {}

  async execute(
    projectIdentifier?: string,
    agentIdentifier?: string
  ): Promise<{ project: string; agent?: string; settings: HarnessSettingsMap }> {
    if (!projectIdentifier || projectIdentifier.trim() === '') {
      throw new HttpServerError(
        400,
        'MISSING_PROJECT_IDENTIFIER',
        `Project identifier query parameter 'project' is required (e.g. GET /orchestrator/settings?project=backend).`
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
    const settingsFilePath = join(targetPath, '.harness-kit', 'settings.json')

    if (!existsSync(settingsFilePath)) {
      HarnessSettings.createLocalSettings(targetPath)
    }

    let settings: HarnessSettingsMap = {}
    try {
      const content = readFileSync(settingsFilePath, 'utf-8')
      settings = JSON.parse(content) as HarnessSettingsMap
    } catch {
      settings = DEFAULT_SETTINGS
    }

    if (agentIdentifier && agentIdentifier.trim() !== '') {
      const cleanAgent = agentIdentifier.trim().toLowerCase()
      if (settings[cleanAgent]) {
        settings = { [cleanAgent]: settings[cleanAgent] }
      }
    }

    return {
      project: name,
      agent: agentIdentifier ? agentIdentifier.trim().toLowerCase() : undefined,
      settings,
    }
  }
}
