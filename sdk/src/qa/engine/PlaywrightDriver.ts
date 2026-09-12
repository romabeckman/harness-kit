import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { QaBrowserAction, QaDriver, QaDriverExecutionContext, QaProfile, QaScenario, QaScenarioResult } from '../types'

export type PlaywrightModule = { chromium: { launch(options: { headless: boolean }): Promise<any> } }
export type PlaywrightLoader = () => Promise<PlaywrightModule>

export class PlaywrightDriver implements QaDriver {
  readonly profile: QaProfile
  readonly #loader: PlaywrightLoader

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

  async execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal, context?: QaDriverExecutionContext): Promise<QaScenarioResult> {
    if (signal?.aborted) {
      return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason: signal.reason instanceof Error ? signal.reason.message : String(signal.reason ?? 'Execution cancelled'), evidence: [] }
    }
    try {
      const playwright = await this.loadPlaywright()
      mkdirSync(evidenceDir, { recursive: true })
      const browser = await playwright.chromium.launch({ headless: true })
      try {
        if (signal?.aborted) throw signal.reason ?? new Error('Execution cancelled')
        const page = await browser.newPage({ ...this.pageOptions(), ...(context?.auth.basic ? { httpCredentials: context.auth.basic } : {}) })
        await applyBrowserAuth(page, target, context)
        const pageErrors: string[] = []
        page.on?.('pageerror', (error: Error) => pageErrors.push(error.message))
        await page.goto(target, { waitUntil: 'networkidle', signal })
        for (const action of scenario.actions ?? []) {
          if (signal?.aborted) throw signal.reason ?? new Error('Execution cancelled')
          await this.perform(page, action, signal)
        }
        const observations = await this.inspect(page, scenario)
        const observationsPath = join(evidenceDir, 'observations.json')
        writeFileSync(observationsPath, JSON.stringify(observations, null, 2), 'utf8')
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
        const failure = observations.find((observation) => !observation.passed)
        if (failure) return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: failure.message, evidence }
        return {
          scenarioId: scenario.id,
          required: scenario.required,
          status: 'PASSED',
          evidence,
        }
      } finally {
        await browser.close()
      }
    } catch (error) {
      return { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED', reason: error instanceof Error ? error.message : 'Browser execution failed', evidence: [] }
    }
  }

  protected pageOptions(): Record<string, unknown> {
    return {}
  }

  protected async inspect(page: any, scenario: QaScenario): Promise<Array<{ type: string; passed: boolean; message: string }>> {
    if (!scenario.assertions?.length) return [{ type: 'coverage', passed: false, message: 'Browser scenario has no executable assertions' }]
    const results: Array<{ type: string; passed: boolean; message: string }> = []
    for (const assertion of scenario.assertions) {
      const locator = assertion.selector ? page.locator(assertion.selector) : undefined
      if (assertion.type === 'visible' || assertion.type === 'hidden') {
        const visible = await locator.isVisible()
        const expected = assertion.type === 'visible'
        results.push({ type: assertion.type, passed: visible === expected, message: `Expected ${assertion.selector} to be ${assertion.type}` })
      } else if (assertion.type === 'text') {
        const actual = (await locator.textContent()) ?? ''
        results.push({ type: assertion.type, passed: actual.includes(assertion.value ?? ''), message: `Expected text ${JSON.stringify(assertion.value)} in ${assertion.selector}; observed ${JSON.stringify(actual)}` })
      } else if (assertion.type === 'url') {
        const actual = page.url()
        results.push({ type: assertion.type, passed: actual === assertion.value, message: `Expected URL ${assertion.value}; observed ${actual}` })
      } else if (assertion.type === 'count') {
        const actual = await locator.count()
        results.push({ type: assertion.type, passed: actual === assertion.count, message: `Expected ${assertion.selector} count ${assertion.count}; observed ${actual}` })
      } else {
        const actual = await locator.getAttribute(assertion.attribute)
        results.push({ type: assertion.type, passed: actual === assertion.value, message: `Expected ${assertion.selector} attribute ${assertion.attribute}=${JSON.stringify(assertion.value)}; observed ${JSON.stringify(actual)}` })
      }
    }
    return results
  }

  private async perform(page: any, action: QaBrowserAction, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason ?? new Error('Execution cancelled')
    if (action.type === 'navigate') return page.goto(action.value, { waitUntil: 'networkidle', signal })
    if (action.type === 'click' && action.selector) return page.locator(action.selector).click()
    if (action.type === 'fill' && action.selector && action.value !== undefined) return page.locator(action.selector).fill(action.value)
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
    if (action.type === 'resize' && action.width && action.height) return page.setViewportSize({ width: action.width, height: action.height })
    throw new Error(`Invalid browser action: ${action.type}`)
  }

  protected async loadPlaywright(): Promise<PlaywrightModule> {
    return this.#loader()
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
    if (new URL(request.url()).origin !== origin) return route.continue()
    return route.continue({ headers: { ...request.headers(), ...auth.headers } })
  })
}

function loadPlaywrightModule(): Promise<PlaywrightModule> {
  const importer = Function('moduleName', 'return import(moduleName)') as (moduleName: string) => Promise<PlaywrightModule>
  return importer('playwright')
}
