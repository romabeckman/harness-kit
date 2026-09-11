import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import type { QaBrowserAction, QaBrowserAssertion, QaCliRequest, QaHttpRequest, QaMcpRequest, QaPlan, QaProfile, QaScenario, QaScenarioCategory, QaWebSocketRequest } from '../types'
import { QaPhase, resolveQaPhaseSettings, type QaPhaseContext, type QaPhaseHandler } from './types'

const PROFILES: QaProfile[] = ['api', 'web', 'web-game', 'mobile-web', 'accessibility', 'mcp', 'cli', 'websocket', 'security', 'full']
const ACTIONS = ['navigate', 'click', 'fill', 'press', 'wait', 'resize'] as const
const ASSERTIONS = ['visible', 'hidden', 'text', 'url', 'count', 'attribute'] as const
const CATEGORIES: QaScenarioCategory[] = ['functional', 'negative', 'boundary', 'security', 'accessibility', 'resilience']
const MAX_SCENARIOS = 50
const MAX_ACTIONS = 100
const MAX_KEY_PRESSES = 500
const MAX_WAIT_MS = 30_000

export class QaPlanningPhase implements QaPhaseHandler {
  readonly phase = QaPhase.PLANNING

  async execute(context: QaPhaseContext, signal?: AbortSignal): Promise<QaPhase> {
    const agentSettings = resolveQaPhaseSettings(context, 'qa_planning')
    const output = await context.runner.run({
      agent: 'harness-kit:harness-qa',
      mode: 'autonomous',
      phaseKey: 'qa_planning',
      workspacePath: context.workspace,
      model: agentSettings.model,
      effort: agentSettings.effort,
      timeoutMs: agentSettings.timeoutMs,
      prompt: this.buildPrompt(context),
    }, { signal })
    context.session = output.session
    context.plan = this.parse(output.raw, context.request, context.store.nextPlanVersion(stringPlanId(output.raw)))
    context.store.savePlan(context.plan)
    return QaPhase.EXECUTION
  }

  private buildPrompt(context: QaPhaseContext): string {
    return [
      'Act as an independent human QA planner.',
      `Inspect project at: ${context.workspace}`,
      `Open scope: ${context.request.scope ?? 'Validate the complete user-visible runtime behavior.'}`,
      'User-supplied scenarios:',
      ...(context.request.scenarios?.length ? context.request.scenarios.map((scenario, index) => `${index + 1}. ${scenario}`) : ['None. Derive scenarios from the open scope and project behavior.']),
      `Target URL hint: ${context.request.target ?? 'Infer the local runtime URL from the project.'}`,
      `Profile hint: ${context.request.profile ?? 'Infer api, web, web-game, mobile-web, accessibility, mcp, cli, or websocket.'}`,
      '',
      'Plan only. Do not change product code. Do not execute tests yet.',
      'For APIs, define real HTTP requests. For interfaces, define human navigation, click, fill, press, and wait actions.',
      'For web games, start a session and include meaningful player controls.',
      'Cover functional, negative, boundary, security, accessibility, and resilience risks when relevant. Try malformed input, unauthorized access, unsafe navigation, repeated actions, and recoverable failures without leaving the configured target.',
      'Use only these browser action JSON shapes: {"type":"navigate","url":"http://..."}, {"type":"click","selector":"..."}, {"type":"fill","selector":"...","value":"..."}, {"type":"press","key":"ArrowLeft","count":1}, {"type":"wait","milliseconds":500}, {"type":"resize","width":320,"height":800}.',
      'Do not invent browser action types or property names. Omit count only when one key press is enough.',
      'Every web scenario needs executable assertions. Use: {"type":"visible|hidden","selector":"..."}, {"type":"text","selector":"...","value":"expected text"}, {"type":"url","value":"http://..."}, {"type":"count","selector":"...","count":1}, {"type":"attribute","selector":"...","attribute":"name","value":"expected"}.',
      'API scenarios may assert expectedHeaders, expectedBodyContains, and a partial expectedJson object in request. API request paths must be relative to target origin.',
      'MCP scenarios use mcp: {"method":"tools/call","params":{"name":"tool","arguments":{}},"expectedResultContains":"text"}.',
      'CLI scenarios use cli: {"command":"hrns","args":["--version"],"expectedExitCode":0,"expectedStdoutContains":"text"}. Never use shell commands or executable paths.',
      'WebSocket scenarios use websocket: {"messages":["ping"],"expectedMessages":["pong"]}.',
      `Limits: at most ${MAX_SCENARIOS} scenarios, ${MAX_ACTIONS} actions per scenario, ${MAX_KEY_PRESSES} repeated key presses, and ${MAX_WAIT_MS} milliseconds per wait.`,
      'Every criterion must map to one required executable scenario.',
      'Use criterionIds exactly as criterion-1, criterion-2, and so on without zero padding.',
      'Treat user-supplied scenarios as a required baseline. Analyze coverage gaps and add new scenarios when needed.',
      'When no scenario is supplied, derive complete scenarios from the open scope and inspected project.',
      'Return one raw JSON object without Markdown:',
      '{"id":"safe-plan-id","target":"http://127.0.0.1:3000","profile":"api|web|web-game|mobile-web|accessibility|mcp|cli|websocket","criteria":["observable success condition"],"scenarios":[{"id":"safe-scenario-id","criterionIds":["criterion-1"],"required":true,"profile":"api","category":"functional","description":"human action and expected result","request":{"method":"GET","path":"/health","expectedStatus":200}}]}',
      'Include only the request shape owned by the selected profile.',
    ].join('\n')
  }

  parse(raw: string, request: QaPhaseContext['request'], version: number): QaPlan {
    const extraction = JsonExtractionProtocol.extract(raw)
    if (!isExtractionResult(extraction) || !isRecord(extraction.data)) throw new Error('Invalid agentic QA plan: expected JSON object')
    const data = extraction.data
    const id = stringValue(data.id)
    const target = request.target ?? stringValue(data.target)
    const profile = data.profile
    const criteria = stringArray(data.criteria)
    const scenarioData = Array.isArray(data.scenarios) ? data.scenarios : []
    if (!id || !target || !PROFILES.includes(profile as QaProfile) || criteria.length === 0 || scenarioData.length === 0 || scenarioData.length > MAX_SCENARIOS) {
      throw new Error('Invalid agentic QA plan: id, target, profile, criteria, and scenarios are required')
    }
    if (scenarioData.length < (request.scenarios?.length ?? 0)) {
      throw new Error('Invalid agentic QA plan: supplied scenarios were not covered')
    }
    if (profile !== 'cli') {
      try { new URL(target) } catch { throw new Error('Invalid agentic QA plan: target must be a URL') }
    }
    const scenarios = scenarioData.map((value, index) => this.parseScenario(value, profile as QaProfile, target, index))
    if (new Set(scenarios.map((scenario) => scenario.id)).size !== scenarios.length) throw new Error('Invalid agentic QA plan: scenario IDs must be unique')
    for (let index = 0; index < criteria.length; index++) {
      if (!scenarios.some((scenario) => scenario.criterionIds.includes(`criterion-${index + 1}`))) {
        throw new Error(`Invalid agentic QA plan: criterion ${index + 1} has no executable scenario`)
      }
    }
    return { schemaVersion: 1, id, version, target, profile: profile as QaProfile, createdAt: new Date().toISOString(), criteria, scenarios }
  }

  private parseScenario(value: unknown, planProfile: QaProfile, target: string, index: number): QaScenario {
    if (!isRecord(value)) throw new Error(`Invalid agentic QA plan: scenario ${index + 1} must be an object`)
    const id = stringValue(value.id)
    const profile = value.profile
    const criterionIds = stringArray(value.criterionIds).map(normalizeCriterionId)
    const allowedProfile = planProfile === 'full'
      ? PROFILES.includes(profile as QaProfile) && profile !== 'full'
      : planProfile === 'security'
        ? (profile === 'security' || profile === 'api' || profile === 'web')
        : profile === planProfile
    if (!id || !PROFILES.includes(profile as QaProfile) || !allowedProfile || criterionIds.length === 0 || value.required !== true) {
      throw new Error(`Invalid agentic QA plan: scenario ${index + 1} is not executable`)
    }
    const scenario: QaScenario = {
      id,
      criterionIds,
      required: true,
      profile: profile as QaProfile,
      description: stringValue(value.description),
      category: CATEGORIES.includes(value.category as QaScenarioCategory) ? value.category as QaScenarioCategory : undefined,
    }
    if (profile === 'api' || (profile === 'security' && isRecord(value.request))) scenario.request = this.parseRequest(value.request, index)
    else if (profile === 'mcp') scenario.mcp = this.parseMcp(value.mcp, index)
    else if (profile === 'cli') scenario.cli = this.parseCli(value.cli, index)
    else if (profile === 'websocket') scenario.websocket = this.parseWebSocket(value.websocket, index)
    else if (profile === 'accessibility') {
      scenario.actions = Array.isArray(value.actions) && value.actions.length > 0 ? this.parseActions(value.actions, target, index) : []
    } else {
      scenario.actions = this.parseActions(value.actions, target, index)
      scenario.assertions = this.parseAssertions(value.assertions, index)
    }
    return scenario
  }

  private parseMcp(value: unknown, index: number): QaMcpRequest {
    if (!isRecord(value) || !stringValue(value.method) || (value.params !== undefined && !isRecord(value.params))) throw new Error(`Invalid agentic QA plan: MCP scenario ${index + 1} needs method and object params`)
    return { method: stringValue(value.method)!, params: value.params as Record<string, unknown> | undefined, expectedResultContains: stringValue(value.expectedResultContains) }
  }

  private parseCli(value: unknown, index: number): QaCliRequest {
    if (!isRecord(value) || !stringValue(value.command) || !Number.isInteger(value.expectedExitCode) || (value.args !== undefined && !isStringArray(value.args))) throw new Error(`Invalid agentic QA plan: CLI scenario ${index + 1} needs command, args, and expectedExitCode`)
    return { command: stringValue(value.command)!, args: value.args as string[] | undefined, expectedExitCode: value.expectedExitCode as number, expectedStdoutContains: stringValue(value.expectedStdoutContains), expectedStderrContains: stringValue(value.expectedStderrContains) }
  }

  private parseWebSocket(value: unknown, index: number): QaWebSocketRequest {
    if (!isRecord(value) || !isStringArray(value.messages) || !isStringArray(value.expectedMessages) || value.expectedMessages.length === 0) throw new Error(`Invalid agentic QA plan: WebSocket scenario ${index + 1} needs messages and expectedMessages`)
    return { messages: value.messages, expectedMessages: value.expectedMessages }
  }

  private parseRequest(value: unknown, index: number): QaHttpRequest {
    if (!isRecord(value) || !stringValue(value.method) || !stringValue(value.path) || !Number.isInteger(value.expectedStatus)) {
      throw new Error(`Invalid agentic QA plan: API scenario ${index + 1} needs method, path, and expectedStatus`)
    }
    return {
      method: stringValue(value.method)!,
      path: stringValue(value.path)!,
      expectedStatus: value.expectedStatus as number,
      headers: isStringRecord(value.headers) ? value.headers : undefined,
      body: stringValue(value.body),
      expectedHeaders: isStringRecord(value.expectedHeaders) ? value.expectedHeaders : undefined,
      expectedBodyContains: stringValue(value.expectedBodyContains),
      expectedJson: value.expectedJson,
    }
  }

  private parseActions(value: unknown, target: string, index: number): QaBrowserAction[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ACTIONS) throw new Error(`Invalid agentic QA plan: browser scenario ${index + 1} needs bounded actions`)
    return value.map((action, actionIndex) => {
      if (!isRecord(action) || !ACTIONS.includes(action.type as typeof ACTIONS[number])) {
        throw new Error(`Invalid agentic QA plan: scenario ${index + 1} action ${actionIndex + 1} is invalid`)
      }
      const invalid = () => new Error(`Invalid agentic QA plan: scenario ${index + 1} action ${actionIndex + 1} is invalid`)
      if (action.type === 'navigate') {
        const url = stringValue(action.url) ?? stringValue(action.value)
        if (!url) throw invalid()
        return { type: 'navigate', value: normalizeNavigationUrl(url, target) }
      }
      if (action.type === 'click') {
        const selector = stringValue(action.selector)
        if (!selector) throw invalid()
        return { type: 'click', selector }
      }
      if (action.type === 'fill') {
        const selector = stringValue(action.selector)
        if (!selector || typeof action.value !== 'string') throw invalid()
        return { type: 'fill', selector, value: action.value }
      }
      if (action.type === 'press') {
        const key = stringValue(action.key) ?? stringValue(action.value)
        const count = action.count === undefined ? undefined : positiveInteger(action.count)
        if (!key || (action.count !== undefined && (count === undefined || count > MAX_KEY_PRESSES))) throw invalid()
        return { type: 'press', value: key, count }
      }
      if (action.type === 'wait') {
        const milliseconds = nonNegativeNumber(action.milliseconds ?? action.value)
        if (milliseconds === undefined || milliseconds > MAX_WAIT_MS) throw invalid()
        return { type: 'wait', value: String(milliseconds) }
      }
      const width = positiveInteger(action.width)
      const height = positiveInteger(action.height)
      if (!width || !height) throw invalid()
      return { type: 'resize', width, height }
    })
  }

  private parseAssertions(value: unknown, index: number): QaBrowserAssertion[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ACTIONS) throw new Error(`Invalid agentic QA plan: browser scenario ${index + 1} needs executable assertions`)
    return value.map((item) => {
      if (!isRecord(item) || !ASSERTIONS.includes(item.type as typeof ASSERTIONS[number])) throw new Error(`Invalid agentic QA plan: browser scenario ${index + 1} has invalid assertion`)
      const type = item.type as QaBrowserAssertion['type']
      const selector = stringValue(item.selector)
      const assertion: QaBrowserAssertion = { type, selector, value: typeof item.value === 'string' ? item.value : undefined }
      if (type !== 'url' && !selector) throw new Error(`Invalid agentic QA plan: browser scenario ${index + 1} assertion needs selector`)
      if ((type === 'text' || type === 'url') && assertion.value === undefined) throw new Error(`Invalid agentic QA plan: browser scenario ${index + 1} assertion needs value`)
      if (type === 'count') {
        assertion.count = nonNegativeInteger(item.count)
        if (assertion.count === undefined) throw new Error(`Invalid agentic QA plan: browser scenario ${index + 1} count assertion is invalid`)
      }
      if (type === 'attribute') {
        assertion.attribute = stringValue(item.attribute)
        if (!assertion.attribute || assertion.value === undefined) throw new Error(`Invalid agentic QA plan: browser scenario ${index + 1} attribute assertion is invalid`)
      }
      return assertion
    })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function normalizeCriterionId(value: string): string {
  const match = /^criterion-0*(\d+)$/.exec(value)
  return match ? `criterion-${Number.parseInt(match[1], 10)}` : value
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function nonNegativeNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function stringPlanId(raw: string): string {
  const extraction = JsonExtractionProtocol.extract(raw)
  if (!isExtractionResult(extraction) || !isRecord(extraction.data) || !stringValue(extraction.data.id)) throw new Error('Invalid agentic QA plan: id is required')
  return stringValue(extraction.data.id)!
}

function normalizeNavigationUrl(value: string, target: string): string {
  const requested = new URL(value, target)
  const runtime = new URL(target)
  if (requested.origin === runtime.origin) return value
  if (requested.pathname === '/' && !requested.search && !requested.hash) return target
  return new URL(`${requested.pathname}${requested.search}${requested.hash}`, runtime).toString()
}
