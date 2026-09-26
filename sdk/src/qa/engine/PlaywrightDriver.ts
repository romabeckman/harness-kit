import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { QaBrowserAction, QaDriver, QaDriverExecutionContext, QaEvidence, QaProfile, QaScenario, QaScenarioResult } from '../types'
import { redactSecrets } from './QaAuthRedaction'

export type PlaywrightModule = { chromium: { launch(options: { headless: boolean }): Promise<any> } }
export type PlaywrightLoader = () => Promise<PlaywrightModule>

const MAX_WAIT_MS = 30_000
const ASSERTION_TIMEOUT_MS = 3_000
const ASSERTION_POLL_MS = 50

type PlaywrightRun = {
  browser: any
}

export class PlaywrightDriver implements QaDriver {
  readonly profile: QaProfile
  readonly #loader: PlaywrightLoader
  readonly #runs = new Map<string, PlaywrightRun>()

  constructor(profile: QaProfile, loader: PlaywrightLoader = loadPlaywrightModule) {
    this.profile = profile
    this.#loader = loader
  }

  async doctor(): Promise<{ available: boolean; reason?: string }> {
    try {
      await this.loadPlaywright()
      return { available: true }
    } catch {
      return { available: false, reason: 'Playwright is unavailable. Run rtk npm install, then rtk npx playwright install chromium.' }
    }
  }

  async startRun(runId: string, _target: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason ?? new Error('Execution cancelled')
    if (this.#runs.has(runId)) return
    const playwright = await this.loadPlaywright()
    const browser = await playwright.chromium.launch({ headless: true })
    this.#runs.set(runId, { browser })
  }

  async finishRun(runId: string): Promise<void> {
    const run = this.#runs.get(runId)
    if (!run) return
    this.#runs.delete(runId)
    await run.browser.close()
  }

  async execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal, context?: QaDriverExecutionContext): Promise<QaScenarioResult> {
    if (signal?.aborted) {
      return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason: signal.reason instanceof Error ? signal.reason.message : String(signal.reason ?? 'Execution cancelled'), evidence: [] }
    }
    try {
      const sharedRun = context?.runId ? this.#runs.get(context.runId) : undefined
      const playwright = sharedRun ? undefined : await this.loadPlaywright()
      mkdirSync(evidenceDir, { recursive: true })
      const browser = sharedRun?.browser ?? await playwright!.chromium.launch({ headless: true })
      const ownsBrowser = !sharedRun
      let page: any
      let pageReady = false
      let pageErrors: string[] = []
      try {
        if (signal?.aborted) throw signal.reason ?? new Error('Execution cancelled')
        pageErrors = []
        // browser.newPage creates a fresh context; closing the page disposes that context.
        page = await browser.newPage({ ...this.pageOptions(), ...(context?.auth.basic ? { httpCredentials: { ...context.auth.basic, origin: new URL(target).origin } } : {}) })
        page.on?.('pageerror', (error: Error) => pageErrors.push(redactSecrets(error.message, context?.auth)))
        await applyBrowserAuth(page, target, context)
        const initialResponse = await page.goto(target, { waitUntil: 'domcontentloaded', signal })
        pageReady = true
        assertHttpError(initialResponse)
        for (const action of scenario.actions ?? []) {
          if (signal?.aborted) throw signal.reason ?? new Error('Execution cancelled')
          await this.perform(page, action, signal, context, target)
        }
        const observations = await this.inspect(page, scenario, signal)
        const safeObservations = redactBrowserObservations(observations, context)
        const observationsPath = join(evidenceDir, 'observations.json')
        writeFileSync(observationsPath, JSON.stringify(safeObservations, null, 2), 'utf8')
        const screenshotPath = join(evidenceDir, 'final.png')
        await page.screenshot({ path: screenshotPath, fullPage: true })
        if (!existsSync(screenshotPath) || statSync(screenshotPath).size === 0 || !existsSync(observationsPath)) {
          return { scenarioId: scenario.id, required: scenario.required, status: 'INCONCLUSIVE', reason: 'Verified browser evidence files are missing', evidence: [] }
        }
        const evidence = [
          { id: `${scenario.id}-screenshot`, path: screenshotPath, capturedAt: new Date().toISOString(), adapter: 'playwright' },
          { id: `${scenario.id}-observations`, path: observationsPath, capturedAt: new Date().toISOString(), adapter: 'playwright' },
        ]
        if (pageErrors.length > 0) {
          return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: `Browser page error: ${pageErrors[0]}`, evidence }
        }
        const failure = safeObservations.find((observation) => !observation.passed)
        if (failure) return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: failure.message, evidence }
        return {
          scenarioId: scenario.id,
          required: scenario.required,
          status: 'PASSED',
          evidence,
        }
      } catch (error) {
        const reason = redactSecrets(error instanceof Error ? error.message : 'Browser execution failed', context?.auth)
        const observedStatus = httpStatusFromError(error)
        const isHttpError = observedStatus !== undefined || isHttpNavigationError(error)
        if (signal?.aborted || !page || (!pageReady && !isHttpError)) {
          return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason, evidence: [] }
        }
        const evidence = await captureFailureEvidence(page, evidenceDir, scenario.id, reason, pageErrors, context)
        return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', observedStatus, reason, evidence }
      } finally {
        if (ownsBrowser) await browser.close()
        else await page?.close()
      }
    } catch (error) {
      const reason = redactSecrets(error instanceof Error ? error.message : 'Browser execution failed', context?.auth)
      return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason, evidence: [] }
    }
  }

  protected pageOptions(): Record<string, unknown> {
    return {}
  }

  protected async inspect(page: any, scenario: QaScenario, signal?: AbortSignal): Promise<Array<{ type: string; passed: boolean; message: string }>> {
    if (!scenario.assertions?.length) return [{ type: 'coverage', passed: false, message: 'Browser scenario has no executable assertions' }]
    const results: Array<{ type: string; passed: boolean; message: string }> = []
    for (const assertion of scenario.assertions) {
      const deadline = Date.now() + ASSERTION_TIMEOUT_MS
      let observation: { type: string; passed: boolean; message: string }
      do {
        if (signal?.aborted) throw signal.reason ?? new Error('Browser assertion cancelled')
        observation = await inspectAssertion(page, assertion)
        if (observation.passed || Date.now() >= deadline) break
        await delayWithSignal(Math.min(ASSERTION_POLL_MS, deadline - Date.now()), signal)
      } while (true)
      results.push(observation)
    }
    return results
  }

  private async perform(page: any, action: QaBrowserAction, signal: AbortSignal | undefined, context: QaDriverExecutionContext | undefined, target: string): Promise<void> {
    if (signal?.aborted) throw signal.reason ?? new Error('Execution cancelled')
    if (action.type === 'navigate') {
      const url = new URL(action.value!, target)
      if (url.origin !== new URL(target).origin) throw new Error('Browser navigation must stay within target origin')
      const response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded', signal })
      assertHttpError(response)
      return
    }
    if (action.type === 'click' && action.selector) return page.locator(action.selector).click()
    if (action.type === 'fill' && action.selector) {
      const value = action.valueFrom ? context?.auth.environment[action.valueFrom] : action.value
      if (value === undefined) throw new Error(`Configured QA form value ${action.valueFrom ?? '<literal>'} is unavailable`)
      return page.locator(action.selector).fill(value)
    }
    if (action.type === 'press' && action.value) {
      const count = Math.min(action.count ?? 1, 500)
      for (let index = 0; index < count; index++) {
        if (signal?.aborted) throw signal.reason ?? new Error('Execution cancelled')
        await page.keyboard.press(action.value)
      }
      return
    }
    if (action.type === 'wait') {
      const ms = Math.min(Number(action.value ?? 0), 30_000)
      if (ms <= 0) return
      if (typeof page.waitForTimeout === 'function') {
        return page.waitForTimeout(ms)
      }
      return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason ?? new Error('Wait cancelled'))
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, ms)
        const onAbort = () => {
          clearTimeout(timer)
          reject(signal?.reason ?? new Error('Wait cancelled'))
        }
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
    if (action.type === 'waitForSelector' && action.selector) {
      if (typeof page.waitForSelector !== 'function') throw new Error('Playwright does not support waitForSelector')
      return page.waitForSelector(action.selector, { state: action.state ?? 'visible', timeout: action.timeout ?? MAX_WAIT_MS, signal })
    }
    if (action.type === 'waitForUrl' && action.value) {
      if (typeof page.waitForURL !== 'function') throw new Error('Playwright does not support waitForURL')
      return page.waitForURL(new URL(action.value, target).toString(), { waitUntil: 'domcontentloaded', timeout: action.timeout ?? MAX_WAIT_MS, signal })
    }
    if (action.type === 'resize' && action.width && action.height) return page.setViewportSize({ width: action.width, height: action.height })
    throw new Error(`Invalid browser action: ${action.type}`)
  }

  protected async loadPlaywright(): Promise<PlaywrightModule> {
    return this.#loader()
  }
}

function assertHttpError(response: any): void {
  const status = typeof response?.status === 'function' ? response.status() : undefined
  if (typeof status === 'number' && status >= 500) throw new BrowserHttpError(status)
}

class BrowserHttpError extends Error {
  constructor(readonly status: number) {
    super(`Browser navigation returned HTTP ${status}`)
    this.name = 'BrowserHttpError'
  }
}

function httpStatusFromError(error: unknown): number | undefined {
  if (error instanceof BrowserHttpError) return error.status
  if (!(error instanceof Error)) return undefined
  const match = /\bHTTP(?:\s+status)?\s*([45]\d{2})\b/i.exec(error.message)
  return match ? Number(match[1]) : undefined
}

function isHttpNavigationError(error: unknown): boolean {
  return error instanceof Error && /ERR_HTTP_RESPONSE_CODE_FAILURE/i.test(error.message)
}

async function captureFailureEvidence(page: any, evidenceDir: string, scenarioId: string, reason: string, pageErrors: string[], context?: QaDriverExecutionContext): Promise<QaEvidence[]> {
  const evidence: QaEvidence[] = []
  const capturedAt = new Date().toISOString()
  const observationsPath = join(evidenceDir, 'observations.json')
  try {
    writeFileSync(observationsPath, JSON.stringify([{ type: 'execution', passed: false, message: reason }], null, 2), 'utf8')
    if (isUsableEvidenceFile(observationsPath)) evidence.push({ id: `${scenarioId}-observations`, path: observationsPath, capturedAt, adapter: 'playwright' })
  } catch {
    // Keep trying the other evidence channels when a single artifact cannot be written.
  }
  const screenshotPath = join(evidenceDir, 'final.png')
  try {
    await page.screenshot?.({ path: screenshotPath, fullPage: true })
    if (isUsableEvidenceFile(screenshotPath)) evidence.push({ id: `${scenarioId}-screenshot`, path: screenshotPath, capturedAt, adapter: 'playwright' })
  } catch {
    // A browser can fail before screenshots are available; the structured error remains useful evidence.
  }
  const errorPath = join(evidenceDir, 'error.json')
  try {
    writeFileSync(errorPath, JSON.stringify({ error: redactSecrets(reason, context?.auth), pageErrors: pageErrors.map((error) => redactSecrets(error, context?.auth)) }, null, 2), 'utf8')
    if (isUsableEvidenceFile(errorPath)) evidence.push({ id: `${scenarioId}-error`, path: errorPath, capturedAt, adapter: 'playwright' })
  } catch {
    // Return any artifacts captured successfully.
  }
  return evidence
}

function isUsableEvidenceFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).size > 0
  } catch {
    return false
  }
}

async function applyBrowserAuth(page: any, target: string, context?: QaDriverExecutionContext): Promise<void> {
  const auth = context?.auth
  if (!auth || auth.mode === 'none' || auth.mode === 'basic') return
  if (auth.cookie) {
    const cookie = auth.cookie.domain
      ? { ...auth.cookie, path: auth.cookie.path ?? '/' }
      : { name: auth.cookie.name, value: auth.cookie.value, url: target }
    await page.context().addCookies([cookie])
    return
  }
  const origin = new URL(target).origin
  await page.route('**/*', (route: any) => {
    const request = route.request()
    const headers = { ...request.headers() }
    if (new URL(request.url()).origin !== origin) {
      for (const name of Object.keys(auth.headers)) {
        for (const existing of Object.keys(headers)) if (existing.toLowerCase() === name.toLowerCase()) delete headers[existing]
      }
      return route.continue({ headers })
    }
    return route.continue({ headers: mergeAuthHeaders(headers, auth.headers) })
  })
}

async function inspectAssertion(page: any, assertion: NonNullable<QaScenario['assertions']>[number]): Promise<{ type: string; passed: boolean; message: string }> {
  const locator = assertion.selector ? page.locator(assertion.selector) : undefined
  if (assertion.type === 'visible' || assertion.type === 'hidden') {
    const visible = await locator.isVisible()
    return { type: assertion.type, passed: visible === (assertion.type === 'visible'), message: `Expected ${assertion.selector} to be ${assertion.type}` }
  }
  if (assertion.type === 'text') {
    const actual = (await locator.textContent()) ?? ''
    return { type: assertion.type, passed: actual.includes(assertion.value ?? ''), message: `Expected text ${JSON.stringify(assertion.value)} in ${assertion.selector}; observed ${JSON.stringify(actual)}` }
  }
  if (assertion.type === 'url') {
    const actual = page.url()
    return { type: assertion.type, passed: actual === assertion.value, message: `Expected URL ${assertion.value}; observed ${actual}` }
  }
  if (assertion.type === 'count') {
    const actual = await locator.count()
    return { type: assertion.type, passed: actual === assertion.count, message: `Expected ${assertion.selector} count ${assertion.count}; observed ${actual}` }
  }
  const actual = await locator.getAttribute(assertion.attribute)
  return { type: assertion.type, passed: actual === assertion.value, message: `Expected ${assertion.selector} attribute ${assertion.attribute}=${JSON.stringify(assertion.value)}; observed ${JSON.stringify(actual)}` }
}

function redactBrowserObservations(observations: Array<{ type: string; passed: boolean; message: string }>, context?: QaDriverExecutionContext): typeof observations {
  return observations.map((observation) => ({ ...observation, message: redactSecrets(observation.message, context?.auth) }))
}

function mergeAuthHeaders(headers: Record<string, string>, authentication: Record<string, string>): Record<string, string> {
  const merged = { ...headers }
  for (const [name, value] of Object.entries(authentication)) {
    for (const existing of Object.keys(merged)) if (existing.toLowerCase() === name.toLowerCase()) delete merged[existing]
    merged[name] = value
  }
  return merged
}

function delayWithSignal(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Browser assertion cancelled'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error('Browser assertion cancelled'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function loadPlaywrightModule(): Promise<PlaywrightModule> {
  const importer = Function('moduleName', 'return import(moduleName)') as (moduleName: string) => Promise<PlaywrightModule>
  return importer('playwright')
}
