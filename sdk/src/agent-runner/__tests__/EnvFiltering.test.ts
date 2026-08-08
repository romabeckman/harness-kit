import { describe, it, expect } from 'vitest'
import { AbstractCliRunner } from '../AbstractCliRunner'

describe('Environment Variable Filtering (Security)', () => {
  it('SEC-ENV: filterEnv removes sensitive keys from environment', () => {
    const env = {
      PATH: '/usr/bin',
      HOME: '/home/user',
      NODE_ENV: 'production',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      CURSOR_API_KEY: 'cursor-secret',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
      DATABASE_URL: 'postgres://user:pass@host/db',
      AUTH_BASIC_PASS: 'my-password',
      AUTH_BEARER_TOKEN: 'bearer-token',
      AUTH_JWT_SECRET: 'jwt-secret',
      AUTH_HMAC_SECRET: 'hmac-secret',
      GIT_TOKEN: 'git-token',
      API_KEY: 'api-key',
      PROJECT_MAPPINGS: '{"foo": "/path"}',
      ALLOWED_WORKSPACES: '/some/path',
    }

    const filtered = AbstractCliRunner.filterSensitiveEnv(env)

    // Should keep safe vars
    expect(filtered.PATH).toBe('/usr/bin')
    expect(filtered.HOME).toBe('/home/user')
    expect(filtered.NODE_ENV).toBe('production')

    // Should remove sensitive vars
    expect(filtered.ANTHROPIC_API_KEY).toBeUndefined()
    expect(filtered.CURSOR_API_KEY).toBeUndefined()
    expect(filtered.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(filtered.DATABASE_URL).toBeUndefined()
    expect(filtered.AUTH_BASIC_PASS).toBeUndefined()
    expect(filtered.AUTH_BEARER_TOKEN).toBeUndefined()
    expect(filtered.AUTH_JWT_SECRET).toBeUndefined()
    expect(filtered.AUTH_HMAC_SECRET).toBeUndefined()
    expect(filtered.GIT_TOKEN).toBeUndefined()
    expect(filtered.API_KEY).toBeUndefined()
  })

  it('SEC-ENV: filterEnv preserves PROJECT_MAPPINGS and ALLOWED_WORKSPACES for server operation', () => {
    const env = {
      PATH: '/usr/bin',
      PROJECT_MAPPINGS: '{"foo": "/path"}',
      ALLOWED_WORKSPACES: '/some/path',
    }

    const filtered = AbstractCliRunner.filterSensitiveEnv(env)
    // These are NOT passed to child agent processes since agents don't need server config
    expect(filtered.PROJECT_MAPPINGS).toBeUndefined()
    expect(filtered.ALLOWED_WORKSPACES).toBeUndefined()
  })
})
