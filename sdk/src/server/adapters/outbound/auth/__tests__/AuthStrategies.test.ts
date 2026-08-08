import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NoAuthStrategy } from '../NoAuthStrategy'
import { BasicAuthStrategy } from '../BasicAuthStrategy'
import { BearerAuthStrategy } from '../BearerAuthStrategy'
import { JwtAuthStrategy } from '../JwtAuthStrategy'
import { HmacAuthStrategy } from '../HmacAuthStrategy'
import { AuthStrategyFactory } from '../AuthStrategyFactory'

describe('Auth Strategies & Identity Context (AuthUserContext)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.AUTH_MODE
    delete process.env.AUTH_BASIC_USER
    delete process.env.AUTH_BASIC_PASS
    delete process.env.AUTH_BEARER_TOKEN
    delete process.env.AUTH_JWT_SECRET
    delete process.env.AUTH_HMAC_SECRET
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('NoAuthStrategy returns authenticated: true with wildcard allowedProjects', async () => {
    const strategy = new NoAuthStrategy()
    const ctx = await strategy.authenticate({})
    expect(ctx.authenticated).toBe(true)
    expect(ctx.allowedProjects).toEqual(['*'])
  })

  it('BasicAuthStrategy returns AuthUserContext with userId on valid credentials', async () => {
    const strategy = new BasicAuthStrategy('admin', 'secret123')
    const authHeader = 'Basic ' + Buffer.from('admin:secret123').toString('base64')

    const validCtx = await strategy.authenticate({ authorization: authHeader })
    expect(validCtx.authenticated).toBe(true)
    expect(validCtx.userId).toBe('admin')
    expect(validCtx.allowedProjects).toEqual(['*'])

    const invalidCtx = await strategy.authenticate({ authorization: 'Basic invalid' })
    expect(invalidCtx.authenticated).toBe(false)
  })

  it('BearerAuthStrategy returns AuthUserContext on valid token match', async () => {
    const strategy = new BearerAuthStrategy('my-secret-token')

    const validCtx = await strategy.authenticate({ authorization: 'Bearer my-secret-token' })
    expect(validCtx.authenticated).toBe(true)
    expect(validCtx.allowedProjects).toEqual(['*'])

    const invalidCtx = await strategy.authenticate({ authorization: 'Bearer wrong-token' })
    expect(invalidCtx.authenticated).toBe(false)
  })

  it('JwtAuthStrategy validates signed JWT and extracts claims/scopes/allowedProjects', async () => {
    const strategy = new JwtAuthStrategy('jwt-secret-key-123')
    const token = JwtAuthStrategy.signPayload(
      { sub: 'user-42', scope: 'read write', allowed_projects: ['backend', 'frontend'] },
      'jwt-secret-key-123'
    )

    const validCtx = await strategy.authenticate({ authorization: `Bearer ${token}` })
    expect(validCtx.authenticated).toBe(true)
    expect(validCtx.userId).toBe('user-42')
    expect(validCtx.scopes).toEqual(['read', 'write'])
    expect(validCtx.allowedProjects).toEqual(['backend', 'frontend'])

    const invalidCtx = await strategy.authenticate({ authorization: 'Bearer invalid.jwt.token' })
    expect(invalidCtx.authenticated).toBe(false)
  })

  it('HmacAuthStrategy validates HTTP payload signature (X-Signature-256)', async () => {
    const secret = 'hmac-webhook-secret'
    const strategy = new HmacAuthStrategy(secret)
    const rawBody = JSON.stringify({ event: 'push', project: 'backend' })
    const validSignature = HmacAuthStrategy.computeSignature(rawBody, secret)

    const validCtx = await strategy.authenticate({ 'x-signature-256': validSignature }, rawBody)
    expect(validCtx.authenticated).toBe(true)
    expect(validCtx.allowedProjects).toEqual(['*'])

    const invalidCtx = await strategy.authenticate({ 'x-signature-256': 'sha256=invalid' }, rawBody)
    expect(invalidCtx.authenticated).toBe(false)
  })

  it('AuthStrategyFactory instantiates JwtAuthStrategy and HmacAuthStrategy based on AUTH_MODE', () => {
    const jwtStrategy = AuthStrategyFactory.create({ mode: 'jwt', jwtSecret: 'secret123' })
    expect(jwtStrategy).toBeInstanceOf(JwtAuthStrategy)

    const hmacStrategy = AuthStrategyFactory.create({ mode: 'hmac', hmacSecret: 'webhook123' })
    expect(hmacStrategy).toBeInstanceOf(HmacAuthStrategy)
  })

  it('SEC-JWT: JwtAuthStrategy rejects tokens with alg=none', async () => {
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url')
    const fakeToken = `${noneHeader}.${payload}.`
    
    const strategy = new JwtAuthStrategy('my-secret')
    const ctx = await strategy.authenticate({ authorization: `Bearer ${fakeToken}` })
    expect(ctx.authenticated).toBe(false)
  })

  it('SEC-JWT: JwtAuthStrategy rejects tokens with unsupported algorithms', async () => {
    const badHeader = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'user' })).toString('base64url')
    const fakeToken = `${badHeader}.${payload}.fakesig`
    
    const strategy = new JwtAuthStrategy('my-secret')
    const ctx = await strategy.authenticate({ authorization: `Bearer ${fakeToken}` })
    expect(ctx.authenticated).toBe(false)
  })

  it('SEC-AUTH: AuthStrategyFactory logs warning when using NoAuthStrategy', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    AuthStrategyFactory.create({ mode: 'none' })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('NoAuthStrategy'))
    warnSpy.mockRestore()
  })

  it('SEC-AUTH: AuthStrategyFactory falls back to NoAuthStrategy with warning for unrecognized modes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const strategy = AuthStrategyFactory.create({ mode: 'unknown-mode' as any })
    expect(strategy).toBeInstanceOf(NoAuthStrategy)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unrecognized'))
    warnSpy.mockRestore()
  })

  it('SEC-AUTH: AuthStrategyFactory throws when basic auth password is empty', () => {
    expect(() => AuthStrategyFactory.create({ mode: 'basic', basicPass: '' })).toThrow('AUTH_BASIC_PASS')
  })
})
