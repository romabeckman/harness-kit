import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HarnessSettings } from '../../../settings/HarnessSettings'
import { DEFAULT_SETTINGS } from '../../../settings/DefaultSettings'
import type { HarnessSettingsMap } from '../../../settings/SettingsSchema'
import { HttpServerError, HttpServerConfig } from '../../domain/types'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import type { IGetSettingsUseCase } from '../ports/inbound/IGetSettingsUseCase'
import { Runner } from '../../../agent-runner/types'

const SHORT_AGENT_NAMES = ['antigravity', 'claude', 'copilot', 'cursor', 'codex', 'kiro']
const VALID_RUNNERS = Object.values(Runner) as string[]
const ALL_VALID_AGENTS = Array.from(new Set([...SHORT_AGENT_NAMES, ...VALID_RUNNERS]))

function normalizeAgentKey(agent: string): string {
  const clean = agent.trim().toLowerCase()
  const family = clean.replace(/-cli$|-sdk$/, '')
  return SHORT_AGENT_NAMES.includes(family) ? family : clean
}

function isValidAgent(agent?: string): boolean {
  if (!agent || agent.trim() === '') return false
  const clean = agent.trim().toLowerCase()
  return ALL_VALID_AGENTS.includes(clean) || SHORT_AGENT_NAMES.includes(clean.replace(/-cli$|-sdk$/, ''))
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
      if (!isValidAgent(agentIdentifier)) {
        throw new HttpServerError(
          400,
          'INVALID_AGENT',
          `Agent '${agentIdentifier}' is invalid. Valid agents: ${ALL_VALID_AGENTS.join(', ')}`
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
      const agentKey = normalizeAgentKey(agentIdentifier)
      const rawKey = agentIdentifier.trim().toLowerCase()
      if (settings[agentKey]) {
        settings = { [agentKey]: settings[agentKey] }
      } else if (settings[rawKey]) {
        settings = { [rawKey]: settings[rawKey] }
      }
    }

    return {
      project: name,
      agent: agentIdentifier ? agentIdentifier.trim().toLowerCase() : undefined,
      settings,
    }
  }
}
