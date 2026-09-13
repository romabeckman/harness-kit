import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { QaPlan, QaProfile } from '../types'

export interface QaDriverDoctor {
  doctor(profile: QaProfile): Promise<{ available: boolean; reason?: string }>
}

export interface QaPlanValidationResult {
  valid: boolean
  errors: string[]
}

const PROFILES: QaProfile[] = ['api', 'web', 'web-game', 'mobile-web', 'accessibility', 'mcp', 'cli', 'websocket', 'security', 'full']
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const SAFE_COMMAND = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const HTTP_PROFILES = new Set<QaProfile>(['api', 'web', 'web-game', 'mobile-web', 'accessibility', 'mcp', 'security', 'full'])
const BROWSER_PROFILES = new Set<QaProfile>(['web', 'web-game', 'mobile-web', 'accessibility'])
const BROWSER_ACTIONS = new Set(['navigate', 'click', 'fill', 'press', 'wait', 'resize'])
const BROWSER_ASSERTIONS = new Set(['visible', 'hidden', 'text', 'url', 'count', 'attribute'])
const CATEGORIES = new Set(['functional', 'negative', 'boundary', 'security', 'accessibility', 'resilience'])
const MAX_SCENARIOS = 50
const MAX_ACTIONS = 100
const MAX_KEY_PRESSES = 500
const MAX_WAIT_MS = 30_000
const MAX_VIEWPORT = 10_000
const MAX_ARGS = 100

/** Checks a persisted or generated plan before any target probe or driver execution. */
export class QaPlanValidator {
  readonly #drivers: QaDriverDoctor

  constructor(drivers: QaDriverDoctor = { doctor: async () => ({ available: true }) }) {
    this.#drivers = drivers
  }

  async validate(value: unknown, workspace = process.cwd(), signal?: AbortSignal): Promise<QaPlanValidationResult> {
    if (signal?.aborted) throw signal.reason ?? new Error('QA plan validation aborted')
    const errors: string[] = []
    if (!isRecord(value)) return { valid: false, errors: ['plan must be an object'] }
    const plan = value as Partial<QaPlan>

    if (plan.schemaVersion !== 1) errors.push('schemaVersion must be 1')
    if (typeof plan.id !== 'string' || !SAFE_IDENTIFIER.test(plan.id)) errors.push('plan id must be a safe identifier')
    if (!Number.isSafeInteger(plan.version) || (plan.version ?? 0) < 1) errors.push('plan version must be a positive integer')
    if (typeof plan.createdAt !== 'string' || (plan.createdAt.trim().length > 0 && !Number.isFinite(Date.parse(plan.createdAt)))) errors.push('createdAt must be a valid date')

    const profile = plan.profile
    if (!PROFILES.includes(profile as QaProfile)) errors.push('profile must be a supported QA profile')
    const target = typeof plan.target === 'string' ? plan.target : ''
    if (typeof plan.target !== 'string' || target.trim().length === 0) {
      errors.push('target is required')
    } else {
      this.validateTarget(target, profile as QaProfile | undefined, errors, workspace)
    }

    const criteria = plan.criteria
    if (!Array.isArray(criteria) || criteria.length === 0 || criteria.some((criterion) => typeof criterion !== 'string' || criterion.trim().length === 0)) {
      errors.push('criteria must contain only non-empty strings')
    }
    const validCriteria = Array.isArray(criteria) ? criteria : []
    const scenarios = plan.scenarios
    if (!Array.isArray(scenarios) || scenarios.length === 0 || scenarios.length > MAX_SCENARIOS) {
      errors.push(`scenarios must contain between 1 and ${MAX_SCENARIOS} items`)
    }
    const scenarioValues = Array.isArray(scenarios) ? scenarios : []
    const ids = new Set<string>()
    for (const scenario of scenarioValues) {
      if (!isRecord(scenario)) {
        errors.push('each scenario must be an object')
        continue
      }
      this.validateScenario(scenario, profile as QaProfile, target, validCriteria, ids, errors)
    }

    for (let index = 0; index < validCriteria.length; index++) {
      const criterionId = `criterion-${index + 1}`
      if (!scenarioValues.some((scenario) => isRecord(scenario) && Array.isArray(scenario.criterionIds) && scenario.criterionIds.some((value) => typeof value === 'string' && normalizeCriterionId(value) === criterionId))) {
        errors.push(`${criterionId} has no executable scenario`)
      }
    }

    const profiles = [...new Set(scenarioValues.flatMap((scenario) => isRecord(scenario) && typeof scenario.profile === 'string' ? [scenario.profile as QaProfile] : []))]
    for (const scenarioProfile of profiles) {
      if (signal?.aborted) throw signal.reason ?? new Error('QA plan validation aborted')
      if (!PROFILES.includes(scenarioProfile)) continue
      try {
        const availability = await this.#drivers.doctor(scenarioProfile)
        if (!availability.available) errors.push(`${scenarioProfile} driver unavailable: ${availability.reason ?? 'driver is unavailable'}`)
      } catch (error) {
        errors.push(`${scenarioProfile} driver unavailable: ${error instanceof Error ? error.message : 'doctor check failed'}`)
      }
    }

    return { valid: errors.length === 0, errors: deduplicate(errors) }
  }

  private validateTarget(target: string, profile: QaProfile | undefined, errors: string[], workspace: string): void {
    if (profile === 'cli') {
      try {
        if (!statSync(resolve(workspace, target)).isDirectory()) errors.push('CLI target must be an existing directory')
      } catch {
        errors.push('CLI target must be an existing directory')
      }
      return
    }
    let parsed: URL
    try {
      parsed = new URL(target)
    } catch {
      errors.push(profile === 'websocket' ? 'target must be a valid WebSocket URL' : 'target must be a valid HTTP or HTTPS URL')
      return
    }
    if (!parsed.hostname) errors.push('target must include a hostname')
    if (parsed.username || parsed.password) errors.push('target must not include embedded credentials')
    if (profile === 'websocket') {
      if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') errors.push('target must use ws:// or wss:// for websocket profiles')
      return
    }
    if (profile === undefined || !HTTP_PROFILES.has(profile) || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      errors.push(profile === 'mcp' ? 'target must use HTTP or HTTPS for MCP profiles' : 'target must be a valid HTTP or HTTPS URL')
    }
  }

  private validateScenario(scenario: Record<string, unknown>, planProfile: QaProfile, target: string, criteria: unknown[], ids: Set<string>, errors: string[]): void {
    const id = typeof scenario.id === 'string' ? scenario.id : ''
    if (!id || !SAFE_IDENTIFIER.test(id)) errors.push('scenario id must be a safe identifier')
    if (id && ids.has(id)) errors.push('scenario IDs must be unique')
    if (id) ids.add(id)
    if (scenario.required !== true) errors.push(`scenario ${id || '<unknown>'} must be required`)

    const profile = scenario.profile as QaProfile
    const allowed = planProfile === 'full'
      ? PROFILES.includes(profile) && profile !== 'full'
      : planProfile === 'security'
        ? profile === 'security' || profile === 'api' || profile === 'web'
        : profile === planProfile
    if (!PROFILES.includes(profile) || !allowed) errors.push(`scenario ${id || '<unknown>'} must use profile ${planProfile}`)
    this.validateScenarioTarget(profile, target, id, errors)

    const criterionIds = Array.isArray(scenario.criterionIds) ? scenario.criterionIds : []
    if (criterionIds.length === 0 || criterionIds.some((criterionId) => typeof criterionId !== 'string' || !/^criterion-\d+$/.test(criterionId))) {
      errors.push(`scenario ${id || '<unknown>'} must reference at least one criterion`)
    }
    for (const criterionId of criterionIds) {
      if (typeof criterionId === 'string' && /^criterion-(\d+)$/.test(criterionId)) {
        const index = Number.parseInt(criterionId.slice('criterion-'.length), 10) - 1
        if (index < 0 || index >= criteria.length) errors.push(`scenario ${id || '<unknown>'} references unknown criterion ${criterionId}`)
      }
    }
    if (typeof scenario.category === 'string' && !CATEGORIES.has(scenario.category)) errors.push(`scenario ${id || '<unknown>'} category is invalid`)

    if (profile === 'api' || (profile === 'security' && isRecord(scenario.request))) this.validateHttpRequest(scenario, id, target, errors)
    else if (profile === 'security') this.validateHttpRequest(scenario, id, target, errors)
    else if (profile === 'mcp') this.validateMcp(scenario, id, errors)
    else if (profile === 'cli') this.validateCli(scenario, id, errors)
    else if (profile === 'websocket') this.validateWebSocket(scenario, id, errors)
    else if (BROWSER_PROFILES.has(profile)) this.validateBrowser(scenario, id, target, errors)
  }

  private validateHttpRequest(scenario: Record<string, unknown>, id: string, target: string, errors: string[]): void {
    const request = scenario.request
    if (!isRecord(request)) {
      errors.push(`scenario ${id || '<unknown>'} has no executable HTTP request`)
      return
    }
    const method = typeof request.method === 'string' ? request.method : ''
    if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/i.test(method)) errors.push(`scenario ${id || '<unknown>'} request method is invalid`)
    const path = typeof request.path === 'string' ? request.path : ''
    if (!path || path.includes('\0')) errors.push(`scenario ${id || '<unknown>'} request path is required`)
    else {
      try {
        const requestUrl = new URL(path, target)
        const targetUrl = new URL(target)
        if (requestUrl.origin !== targetUrl.origin || (path.includes('://') && !path.startsWith(targetUrl.origin))) errors.push(`scenario ${id || '<unknown>'} request path must be relative to target origin`)
      } catch {
        errors.push(`scenario ${id || '<unknown>'} request path must be relative to target origin`)
      }
    }
    const expectedStatus = request.expectedStatus
    if (typeof expectedStatus !== 'number' || !Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) errors.push(`scenario ${id || '<unknown>'} expectedStatus must be an HTTP status between 100 and 599`)
    this.validateStringRecord(request.headers, `scenario ${id || '<unknown>'} request headers`, errors)
    this.validateStringRecord(request.expectedHeaders, `scenario ${id || '<unknown>'} expected headers`, errors)
    if (request.body !== undefined && typeof request.body !== 'string') errors.push(`scenario ${id || '<unknown>'} request body must be a string`)
    if (request.expectedBodyContains !== undefined && typeof request.expectedBodyContains !== 'string') errors.push(`scenario ${id || '<unknown>'} expectedBodyContains must be a string`)
  }

  private validateScenarioTarget(profile: QaProfile, target: string, id: string, errors: string[]): void {
    if (profile === 'cli') return
    try {
      const protocol = new URL(target).protocol
      if (profile === 'websocket' && protocol !== 'ws:' && protocol !== 'wss:') errors.push(`scenario ${id || '<unknown>'} requires a ws:// or wss:// target`)
      if (profile !== 'websocket' && (protocol !== 'http:' && protocol !== 'https:')) errors.push(`scenario ${id || '<unknown>'} requires an HTTP or HTTPS target`)
    } catch {
      // Target-level validation reports the malformed URL.
    }
  }

  private validateMcp(scenario: Record<string, unknown>, id: string, errors: string[]): void {
    const request = scenario.mcp
    if (!isRecord(request) || typeof request.method !== 'string' || request.method.trim().length === 0) {
      errors.push(`scenario ${id || '<unknown>'} has no executable MCP request`)
      return
    }
    if (request.params !== undefined && !isRecord(request.params)) errors.push(`scenario ${id} MCP params must be an object`)
    if (request.expectedResultContains !== undefined && typeof request.expectedResultContains !== 'string') errors.push(`scenario ${id} MCP expectedResultContains must be a string`)
    if (request.expectedState !== undefined && (typeof request.expectedState !== 'string' || request.expectedState.trim().length === 0)) errors.push(`scenario ${id} MCP expectedState must be a non-empty string`)
    if (request.expectedReasonCode !== undefined && (typeof request.expectedReasonCode !== 'string' || request.expectedReasonCode.trim().length === 0)) errors.push(`scenario ${id} MCP expectedReasonCode must be a non-empty string`)
    if (request.expectedIsError !== undefined && typeof request.expectedIsError !== 'boolean') errors.push(`scenario ${id} MCP expectedIsError must be a boolean`)
  }

  private validateCli(scenario: Record<string, unknown>, id: string, errors: string[]): void {
    const request = scenario.cli
    if (!isRecord(request) || typeof request.command !== 'string') {
      errors.push(`scenario ${id || '<unknown>'} has no executable CLI request`)
      return
    }
    if (!SAFE_COMMAND.test(request.command)) errors.push(`scenario ${id} CLI command must be a safe executable name without a path`)
    if (request.args !== undefined && (!Array.isArray(request.args) || request.args.length > MAX_ARGS || request.args.some((arg) => typeof arg !== 'string' || arg.includes('\0')))) errors.push(`scenario ${id} CLI arguments exceed safety bounds`)
    if (!Number.isInteger(request.expectedExitCode)) errors.push(`scenario ${id} CLI expectedExitCode must be an integer`)
    if (request.expectedStdoutContains !== undefined && typeof request.expectedStdoutContains !== 'string') errors.push(`scenario ${id} CLI expectedStdoutContains must be a string`)
    if (request.expectedStderrContains !== undefined && typeof request.expectedStderrContains !== 'string') errors.push(`scenario ${id} CLI expectedStderrContains must be a string`)
  }

  private validateWebSocket(scenario: Record<string, unknown>, id: string, errors: string[]): void {
    const request = scenario.websocket
    if (!isRecord(request) || !isStringArray(request.messages)) {
      errors.push(`scenario ${id || '<unknown>'} has no executable WebSocket request`)
      return
    }
    if (request.messages.length > MAX_ACTIONS || request.messages.some((message) => message.includes('\0'))) errors.push(`scenario ${id} WebSocket messages exceed safety bounds`)
    if (!isStringArray(request.expectedMessages) || request.expectedMessages.length === 0) errors.push(`scenario ${id} must define at least one expected WebSocket message`)
    else if (request.expectedMessages.length > MAX_ACTIONS || request.expectedMessages.some((message) => message.includes('\0'))) errors.push(`scenario ${id} expected WebSocket messages exceed safety bounds`)
  }

  private validateBrowser(scenario: Record<string, unknown>, id: string, target: string, errors: string[]): void {
    const actions = scenario.actions
    if (!Array.isArray(actions) || (actions.length === 0 && scenario.profile !== 'accessibility') || actions.length > MAX_ACTIONS) {
      errors.push(`scenario ${id || '<unknown>'} browser actions are missing or exceed safety bounds`)
    } else {
      for (const [index, action] of actions.entries()) this.validateBrowserAction(action, id, index, target, errors)
    }
    if (scenario.profile === 'accessibility') return
    const assertions = scenario.assertions
    if (!Array.isArray(assertions) || assertions.length === 0 || assertions.length > MAX_ACTIONS) {
      errors.push(`scenario ${id || '<unknown>'} browser assertions are missing or exceed safety bounds`)
    } else {
      for (const [index, assertion] of assertions.entries()) this.validateBrowserAssertion(assertion, id, index, target, errors)
    }
  }

  private validateBrowserAction(value: unknown, id: string, index: number, target: string, errors: string[]): void {
    if (!isRecord(value) || typeof value.type !== 'string' || !BROWSER_ACTIONS.has(value.type)) {
      errors.push(`scenario ${id} browser action ${index + 1} is invalid`)
      return
    }
    if (value.type === 'navigate') {
      if (typeof value.value !== 'string' || value.value.trim().length === 0) errors.push(`scenario ${id} browser action ${index + 1} needs a URL`)
      else {
        try {
          const url = new URL(value.value, target)
          const targetUrl = new URL(target)
          if (url.origin !== targetUrl.origin) errors.push(`scenario ${id} browser navigation must stay within target origin`)
        } catch {
          errors.push(`scenario ${id} browser action ${index + 1} needs a valid URL`)
        }
      }
    } else if (value.type === 'click') {
      if (typeof value.selector !== 'string' || value.selector.trim().length === 0) errors.push(`scenario ${id} browser action ${index + 1} needs a selector`)
    } else if (value.type === 'fill') {
      if (typeof value.selector !== 'string' || typeof value.value !== 'string') errors.push(`scenario ${id} browser action ${index + 1} needs selector and value`)
    } else if (value.type === 'press') {
      const count = value.count === undefined ? 1 : value.count
      const validCount = typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= MAX_KEY_PRESSES
      if (typeof value.value !== 'string' || value.value.trim().length === 0 || !validCount) errors.push(`scenario ${id} browser action ${index + 1} press count exceeds safety bounds`)
    } else if (value.type === 'wait') {
      const milliseconds = typeof value.value === 'string' ? Number(value.value) : Number.NaN
      if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > MAX_WAIT_MS) errors.push(`scenario ${id} browser action ${index + 1} wait exceeds safety bounds`)
    } else if (!Number.isInteger(value.width) || !Number.isInteger(value.height) || (value.width as number) < 1 || (value.height as number) < 1 || (value.width as number) > MAX_VIEWPORT || (value.height as number) > MAX_VIEWPORT) {
      errors.push(`scenario ${id} browser action ${index + 1} resize dimensions are invalid`)
    }
  }

  private validateBrowserAssertion(value: unknown, id: string, index: number, target: string, errors: string[]): void {
    if (!isRecord(value) || typeof value.type !== 'string' || !BROWSER_ASSERTIONS.has(value.type)) {
      errors.push(`scenario ${id} browser assertion ${index + 1} is invalid`)
      return
    }
    if (value.type !== 'url' && (typeof value.selector !== 'string' || value.selector.trim().length === 0)) errors.push(`scenario ${id} browser assertion ${index + 1} needs a selector`)
    if ((value.type === 'text' || value.type === 'url') && typeof value.value !== 'string') errors.push(`scenario ${id} browser assertion ${index + 1} needs a value`)
    if (value.type === 'url' && typeof value.value === 'string') {
      try {
        const expectedUrl = new URL(value.value)
        const targetUrl = new URL(target)
        if (expectedUrl.origin !== targetUrl.origin) errors.push(`scenario ${id} browser URL assertion must stay within target origin`)
      } catch {
        errors.push(`scenario ${id} browser assertion ${index + 1} URL is invalid`)
      }
    }
    if (value.type === 'count' && (!Number.isInteger(value.count) || (value.count as number) < 0)) errors.push(`scenario ${id} browser assertion ${index + 1} count is invalid`)
    if (value.type === 'attribute' && (typeof value.attribute !== 'string' || typeof value.value !== 'string')) errors.push(`scenario ${id} browser assertion ${index + 1} attribute is invalid`)
  }

  private validateStringRecord(value: unknown, label: string, errors: string[]): void {
    if (value !== undefined && (!isRecord(value) || Object.values(value).some((item) => typeof item !== 'string'))) errors.push(`${label} must contain only strings`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values)]
}

function normalizeCriterionId(value: string): string {
  const match = /^criterion-0*(\d+)$/.exec(value)
  return match ? `criterion-${Number.parseInt(match[1], 10)}` : value
}
