import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QaAuthConfigStore } from '../QaAuthConfigStore'

describe('QaAuthConfigStore', () => {
  const workspaces: string[] = []
  afterEach(() => workspaces.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })))

  it('uses no authentication when auth.json is absent', () => {
    const workspace = temporaryWorkspace()
    expect(new QaAuthConfigStore(workspace).resolve()).toEqual({ mode: 'none', profile: 'none', headers: {}, environment: {} })
  })

  it('resolves named bearer and basic profiles only from environment references', () => {
    const workspace = temporaryWorkspace()
    save(workspace, {
      schemaVersion: 1,
      defaultProfile: 'user',
      profiles: {
        user: { mode: 'bearer', token: { source: 'env', name: 'QA_TOKEN' } },
        admin: { mode: 'basic', username: 'qa-admin', password: { source: 'env', name: 'QA_PASSWORD' } },
      },
    })
    const store = new QaAuthConfigStore(workspace, { QA_TOKEN: 'secret-token', QA_PASSWORD: 'secret-password' })

    expect(store.resolve()).toMatchObject({ profile: 'user', mode: 'bearer', headers: { Authorization: 'Bearer secret-token' } })
    expect(store.resolve('admin')).toMatchObject({ profile: 'admin', mode: 'basic', headers: { Authorization: `Basic ${Buffer.from('qa-admin:secret-password').toString('base64')}` } })
    expect(store.describe()).toEqual([{ name: 'user', mode: 'bearer' }, { name: 'admin', mode: 'basic' }])
  })

  it('resolves API key, cookie, and CLI environment without persisting their values', () => {
    const workspace = temporaryWorkspace()
    save(workspace, { schemaVersion: 1, profiles: {
      service: { mode: 'api-key', header: 'X-API-Key', value: { source: 'env', name: 'QA_KEY' }, environment: { SERVICE_TOKEN: { source: 'env', name: 'QA_KEY' } } },
      browser: { mode: 'cookie', name: 'session', value: { source: 'env', name: 'QA_COOKIE' } },
    } })
    const store = new QaAuthConfigStore(workspace, { QA_KEY: 'key-value', QA_COOKIE: 'cookie-value' })

    expect(store.resolve('service')).toMatchObject({ headers: { 'X-API-Key': 'key-value' }, environment: { SERVICE_TOKEN: 'key-value' } })
    expect(store.resolve('browser')).toMatchObject({ headers: { Cookie: 'session=cookie-value' }, cookie: { name: 'session', value: 'cookie-value' } })
  })

  it('rejects inline secrets, unsafe headers, unknown profiles, and missing environment variables', () => {
    const workspace = temporaryWorkspace()
    save(workspace, { schemaVersion: 1, profiles: { unsafe: { mode: 'bearer', token: 'raw-secret' } } })
    expect(() => new QaAuthConfigStore(workspace).resolve('unsafe')).toThrow('environment reference')

    save(workspace, { schemaVersion: 1, profiles: { unsafe: { mode: 'api-key', header: 'X-Key\r\nInjected', value: { source: 'env', name: 'QA_KEY' } } } })
    expect(() => new QaAuthConfigStore(workspace, { QA_KEY: 'value' }).resolve('unsafe')).toThrow('header')
    expect(() => new QaAuthConfigStore(workspace).resolve('missing')).toThrow('Unknown QA authentication profile')

    save(workspace, { schemaVersion: 1, profiles: { user: { mode: 'bearer', token: { source: 'env', name: 'MISSING_TOKEN' } } } })
    expect(() => new QaAuthConfigStore(workspace).resolve('user')).toThrow('MISSING_TOKEN')
  })

  function temporaryWorkspace(): string {
    const workspace = mkdtempSync(join(tmpdir(), 'qa-auth-'))
    workspaces.push(workspace)
    return workspace
  }
})

function save(workspace: string, value: unknown): void {
  mkdirSync(join(workspace, '.harness-kit'), { recursive: true })
  writeFileSync(join(workspace, '.harness-kit', 'auth.json'), JSON.stringify(value), 'utf8')
}
