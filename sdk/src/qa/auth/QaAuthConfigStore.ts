import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { QaAuthMode, QaAuthProfileDescription, QaResolvedAuth } from './types'
type SecretReference = { source: 'env'; name: string }
type Profile = Record<string, unknown> & { mode: QaAuthMode; environment?: Record<string, SecretReference> }
interface AuthFile { schemaVersion: 1; defaultProfile?: string; profiles: Record<string, Profile> }

export class QaAuthConfigStore {
  readonly #path: string
  constructor(workspace: string, private readonly environment: Readonly<Record<string, string | undefined>> = process.env) { this.#path = join(workspace, '.harness-kit', 'auth.json') }
  describe(): QaAuthProfileDescription[] { const config = this.load(); return config ? Object.entries(config.profiles).map(([name, profile]) => ({ name, mode: profile.mode })) : [] }
  addProfile(name: string, profile: Record<string, unknown>): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error('QA authentication profile name must start with a letter or number and contain only letters, numbers, dots, underscores, or hyphens')
    const config = this.load() ?? { schemaVersion: 1 as const, profiles: {} }
    if (config.profiles[name]) throw new Error(`QA authentication profile already exists: ${name}`)
    if (!record(profile) || !['none', 'basic', 'bearer', 'api-key', 'cookie'].includes(String(profile.mode))) throw new Error(`Invalid QA authentication mode for profile ${name}`)
    const next = { ...config, profiles: { ...config.profiles, [name]: profile } }
    mkdirSync(dirname(this.#path), { recursive: true })
    const temporaryPath = `${this.#path}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
    renameSync(temporaryPath, this.#path)
  }
  resolve(requestedProfile?: string): QaResolvedAuth {
    const config = this.load(); const profileName = requestedProfile ?? config?.defaultProfile
    if (!config || !profileName || profileName === 'none') return { mode: 'none', profile: 'none', headers: {}, environment: {} }
    const profile = config.profiles[profileName]
    if (!profile) throw new Error(`Unknown QA authentication profile: ${profileName}`)
    const environment = Object.fromEntries(Object.entries(profile.environment ?? {}).map(([name, ref]) => [name, this.secret(ref, `${profileName}.environment.${name}`)]))
    if (profile.mode === 'none') return { profile: profileName, mode: 'none', headers: {}, environment }
    if (profile.mode === 'bearer') { const token = safeValue(this.secret(profile.token, `${profileName}.token`)); return { profile: profileName, mode: 'bearer', headers: { Authorization: `Bearer ${token}` }, environment } }
    if (profile.mode === 'basic') { const username = requiredString(profile.username, `${profileName}.username`); const password = this.secret(profile.password, `${profileName}.password`); return { profile: profileName, mode: 'basic', headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }, environment, basic: { username, password } } }
    if (profile.mode === 'api-key') { const header = requiredHeader(profile.header, `${profileName}.header`); const value = safeValue(this.secret(profile.value, `${profileName}.value`)); return { profile: profileName, mode: 'api-key', headers: { [header]: value }, environment } }
    const name = requiredString(profile.name, `${profileName}.name`); const value = safeValue(this.secret(profile.value, `${profileName}.value`)); const domain = optionalString(profile.domain, `${profileName}.domain`); const path = optionalString(profile.path, `${profileName}.path`)
    return { profile: profileName, mode: 'cookie', headers: { Cookie: `${name}=${value}` }, environment, cookie: { name, value, domain, path } }
  }
  private load(): AuthFile | undefined {
    if (!existsSync(this.#path)) return undefined
    let value: unknown; try { value = JSON.parse(readFileSync(this.#path, 'utf8')) } catch (error) { throw new Error(`Invalid QA authentication config at ${this.#path}: ${error instanceof Error ? error.message : String(error)}`) }
    if (!record(value) || value.schemaVersion !== 1 || !record(value.profiles)) throw new Error('QA authentication config requires schemaVersion 1 and profiles')
    const profiles: Record<string, Profile> = {}
    for (const [name, candidate] of Object.entries(value.profiles)) { if (!record(candidate) || !['none', 'basic', 'bearer', 'api-key', 'cookie'].includes(String(candidate.mode))) throw new Error(`Invalid QA authentication mode for profile ${name}`); profiles[name] = candidate as Profile }
    if (value.defaultProfile !== undefined && typeof value.defaultProfile !== 'string') throw new Error('defaultProfile must be a string')
    return { schemaVersion: 1, defaultProfile: value.defaultProfile as string | undefined, profiles }
  }
  private secret(value: unknown, field: string): string { if (!record(value) || value.source !== 'env' || typeof value.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.name)) throw new Error(`${field} must be an environment reference`); const secret = this.environment[value.name]; if (!secret) throw new Error(`Environment variable ${value.name} required by QA authentication profile is missing`); return secret }
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function requiredString(value: unknown, field: string): string { if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} must be a non-empty string`); return safeValue(value) }
function requiredHeader(value: unknown, field: string): string { if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} must be a non-empty string`); return safeHeader(value) }
function optionalString(value: unknown, field: string): string | undefined { return value === undefined ? undefined : requiredString(value, field) }
function safeHeader(value: string): string { if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)) throw new Error('QA authentication header is invalid'); return value }
function safeValue(value: string): string { if (/\r|\n/.test(value)) throw new Error('QA authentication value contains invalid newline characters'); return value }
