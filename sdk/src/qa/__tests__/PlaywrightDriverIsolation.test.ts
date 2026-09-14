import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlaywrightDriver } from '../engine/PlaywrightDriver'
import type { QaResolvedAuth } from '../auth/types'
import type { QaScenario } from '../types'

const anonymous: QaResolvedAuth = { mode: 'none', profile: 'none', headers: {}, environment: {} }
const basic = (username: string): QaResolvedAuth => ({
  mode: 'basic', profile: username, headers: {}, environment: {}, basic: { username, password: `${username}-password` },
})
const scenario = (id: string): QaScenario => ({
  id, criterionIds: ['criterion-1'], required: true, profile: 'web',
  assertions: [{ type: 'visible', selector: '#app' }],
})

// Like browser.newPage(), each call owns a fresh context and page.close() disposes it.
function browserFixture() {
  const pages: any[] = []
  const browser = {
    newPage: vi.fn(async (_options: Record<string, unknown>) => {
      const state = { cookie: '', storage: '' }
      const page = {
        state,
        on: vi.fn(),
        goto: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        context: () => ({ addCookies: async (cookies: Array<{ value: string }>) => { state.cookie = cookies[0].value } }),
        locator: (selector: string) => ({
          click: async () => {
            if (selector === '#fail') throw new Error('Action failed')
            state.cookie = 'admin-session'
            state.storage = 'admin-token'
          },
          isVisible: async () => selector === '#admin' ? Boolean(state.cookie || state.storage) : true,
        }),
        screenshot: async ({ path }: { path: string }) => { writeFileSync(path, 'image') },
      }
      pages.push(page)
      return page
    }),
    close: vi.fn(async () => undefined),
  }
  const launch = vi.fn(async () => browser)
  return { browser, pages, launch, driver: new PlaywrightDriver('web', async () => ({ chromium: { launch } })) }
}

describe('PlaywrightDriver scenario isolation', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'hrns-qa-isolation-')) })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('applies each Basic identity and then anonymous credentials to a fresh context', async () => {
    const { browser, pages, launch, driver } = browserFixture()
    await driver.startRun('run', 'https://qa.test')
    try {
      for (const auth of [basic('admin'), basic('reader'), anonymous]) {
        const result = await driver.execute(scenario(auth.profile), 'https://qa.test', join(root, auth.profile), undefined, { auth, runId: 'run' })
        expect(result.status).toBe('PASSED')
      }
      expect(browser.newPage).toHaveBeenCalledTimes(3)
      expect(browser.newPage.mock.calls.map(([options]) => options.httpCredentials)).toEqual([
        { username: 'admin', password: 'admin-password', origin: 'https://qa.test' },
        { username: 'reader', password: 'reader-password', origin: 'https://qa.test' },
        undefined,
      ])
      expect(pages.every(page => page.close.mock.calls.length === 1)).toBe(true)
      expect(browser.close).not.toHaveBeenCalled()
      expect(launch).toHaveBeenCalledTimes(1)
    } finally {
      await driver.finishRun('run')
    }
    expect(browser.close).toHaveBeenCalledTimes(1)
  })

  it.each(['form', 'cookie'] as const)('isolates %s login state while preserving actions within a scenario', async (mode) => {
    const { driver } = browserFixture()
    const auth: QaResolvedAuth = mode === 'cookie'
      ? { mode: 'cookie', profile: 'admin', headers: {}, environment: {}, cookie: { name: 'session', value: 'admin-session' } }
      : anonymous
    await driver.startRun('run', 'https://qa.test')
    try {
      const admin = await driver.execute({
        ...scenario('admin'),
        actions: mode === 'form' ? [{ type: 'click', selector: '#login' }, { type: 'navigate', value: 'https://qa.test/admin' }] : [],
        assertions: [{ type: 'visible', selector: '#admin' }],
      }, 'https://qa.test', join(root, 'admin'), undefined, { auth, runId: 'run' })
      const visitor = await driver.execute({
        ...scenario('visitor'), assertions: [{ type: 'hidden', selector: '#admin' }],
      }, 'https://qa.test', join(root, 'visitor'), undefined, { auth: anonymous, runId: 'run' })
      expect(admin.status).toBe('PASSED')
      expect(visitor.status).toBe('PASSED')
    } finally {
      await driver.finishRun('run')
    }
  })

  it('closes a failed scenario context before continuing the run', async () => {
    const { driver, pages, browser } = browserFixture()
    await driver.startRun('run', 'https://qa.test')
    try {
      const result = await driver.execute({
        ...scenario('failure'), actions: [{ type: 'click', selector: '#fail' }],
      }, 'https://qa.test', root, undefined, { auth: anonymous, runId: 'run' })
      expect(result).toMatchObject({ status: 'BLOCKED', reason: 'Action failed' })
      expect(pages[0].close).toHaveBeenCalledTimes(1)
      expect(browser.close).not.toHaveBeenCalled()
    } finally {
      await driver.finishRun('run')
    }
  })
})
