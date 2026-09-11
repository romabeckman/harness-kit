import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { QaBrowserAction, QaDriver, QaScenario, QaScenarioResult } from './types'

type PlaywrightModule = { chromium: { launch(options: { headless: boolean }): Promise<any> } }
type PlaywrightLoader = () => Promise<PlaywrightModule>

export class PlaywrightDriver implements QaDriver {
  readonly profile: 'web' | 'web-game'
  readonly #loader: PlaywrightLoader

  constructor(profile: 'web' | 'web-game', loader: PlaywrightLoader = loadPlaywrightModule) {
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

  async execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal): Promise<QaScenarioResult> {
    try {
      const playwright = await this.loadPlaywright()
      mkdirSync(evidenceDir, { recursive: true })
      const browser = await playwright.chromium.launch({ headless: true })
      try {
        const page = await browser.newPage()
        const pageErrors: string[] = []
        page.on?.('pageerror', (error: Error) => pageErrors.push(error.message))
        await page.goto(target, { waitUntil: 'networkidle', signal })
        for (const action of scenario.actions ?? []) await this.perform(page, action)
        const screenshotPath = join(evidenceDir, 'final.png')
        await page.screenshot({ path: screenshotPath, fullPage: true })
        const evidence = [{ id: `${scenario.id}-screenshot`, path: screenshotPath, capturedAt: new Date().toISOString(), adapter: 'playwright' }]
        if (pageErrors.length > 0) {
          return { scenarioId: scenario.id, required: scenario.required, status: 'FAILED', reason: `Browser page error: ${pageErrors[0]}`, evidence }
        }
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

  private async perform(page: any, action: QaBrowserAction): Promise<void> {
    if (action.type === 'navigate') return page.goto(action.value, { waitUntil: 'networkidle' })
    if (action.type === 'click' && action.selector) return page.locator(action.selector).click()
    if (action.type === 'fill' && action.selector && action.value !== undefined) return page.locator(action.selector).fill(action.value)
    if (action.type === 'press' && action.value) {
      for (let index = 0; index < (action.count ?? 1); index++) await page.keyboard.press(action.value)
      return
    }
    if (action.type === 'wait') return page.waitForTimeout(Number(action.value ?? 0))
    if (action.type === 'resize' && action.width && action.height) return page.setViewportSize({ width: action.width, height: action.height })
    throw new Error(`Invalid browser action: ${action.type}`)
  }

  private async loadPlaywright(): Promise<PlaywrightModule> {
    return this.#loader()
  }
}

function loadPlaywrightModule(): Promise<PlaywrightModule> {
  const importer = Function('moduleName', 'return import(moduleName)') as (moduleName: string) => Promise<PlaywrightModule>
  return importer('playwright')
}
