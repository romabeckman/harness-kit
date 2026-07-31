import { describe, it, expect } from 'vitest'
import { parseRunArgs } from '../../src/cli/utils/run-args-parser'

describe('T19 — parseRunArgs', () => {
  // ── agent / model (existing RunOptions) ──────────────────────────────────

  it('parses --agent flag', () => {
    const result = parseRunArgs(['--agent', 'copilot-sdk'])
    expect(result.agentType).toBe('copilot-sdk')
  })

  it('parses -a shorthand', () => {
    const result = parseRunArgs(['-a', 'gemini'])
    expect(result.agentType).toBe('gemini')
  })

  it('parses --model flag', () => {
    const result = parseRunArgs(['--model', 'gpt-4o'])
    expect(result.model).toBe('gpt-4o')
  })

  it('parses -m shorthand', () => {
    const result = parseRunArgs(['-m', 'claude-3-5-sonnet'])
    expect(result.model).toBe('claude-3-5-sonnet')
  })

  // ── action (reset / resume) ───────────────────────────────────────────────

  it('parses --reset flag as action', () => {
    const result = parseRunArgs(['--reset'])
    expect(result.action).toBe('reset')
  })

  it('parses --resume flag as action', () => {
    const result = parseRunArgs(['--resume'])
    expect(result.action).toBe('resume')
  })

  // ── ResetOptions fields ──────────────────────────────────────────────────

  it('parses --scope value', () => {
    const result = parseRunArgs(['--scope', 'Build a REST API for todos'])
    expect(result.scope).toBe('Build a REST API for todos')
  })

  it('parses --score value as number', () => {
    const result = parseRunArgs(['--score', '0.85'])
    expect(result.score).toBe(0.85)
  })

  it('parses --reworks value as integer', () => {
    const result = parseRunArgs(['--reworks', '3'])
    expect(result.reworks).toBe(3)
  })

  it('parses --steering value', () => {
    const result = parseRunArgs(['--steering', 'use strict DDD patterns'])
    expect(result.steeringMessage).toBe('use strict DDD patterns')
  })

  // ── --path accumulator → projectPaths ────────────────────────────────────

  it('parses a single --path into projectPaths array', () => {
    const result = parseRunArgs(['--path', 'C:/Projects/my-app'])
    expect(result.projectPaths).toEqual(['C:/Projects/my-app'])
  })

  it('parses multiple --path flags into projectPaths array', () => {
    const result = parseRunArgs(['--path', 'C:/Projects/api', '--path', 'C:/Projects/frontend'])
    expect(result.projectPaths).toEqual(['C:/Projects/api', 'C:/Projects/frontend'])
  })

  it('ignores duplicate --path values', () => {
    const result = parseRunArgs(['--path', 'C:/Projects/api', '--path', 'C:/Projects/api'])
    expect(result.projectPaths).toEqual(['C:/Projects/api', 'C:/Projects/api'])
  })

  it('returns empty projectPaths when no --path flags given', () => {
    const result = parseRunArgs([])
    expect(result.projectPaths).toEqual([])
  })

  // ── combined args ─────────────────────────────────────────────────────────

  it('parses a full reset invocation', () => {
    const result = parseRunArgs([
      '--reset',
      '--scope', 'Implement auth module',
      '--path', '/srv/apps/api',
      '--path', '/srv/apps/web',
      '--score', '0.9',
      '--reworks', '5',
      '--steering', 'prefer functional style',
      '--agent', 'claude-cli',
      '--model', 'claude-3-7-sonnet',
    ])
    expect(result).toMatchObject({
      action: 'reset',
      scope: 'Implement auth module',
      projectPaths: ['/srv/apps/api', '/srv/apps/web'],
      score: 0.9,
      reworks: 5,
      steeringMessage: 'prefer functional style',
      agentType: 'claude-cli',
      model: 'claude-3-7-sonnet',
    })
  })

  it('parses a full resume invocation', () => {
    const result = parseRunArgs([
      '--resume',
      '--steering', 'focus on security hardening',
      '--agent', 'gemini',
    ])
    expect(result).toMatchObject({
      action: 'resume',
      steeringMessage: 'focus on security hardening',
      agentType: 'gemini',
    })
  })

  // ── debug flag ─────────────────────────────────────────────────────────────

  it('parses --debug flag', () => {
    const result = parseRunArgs(['--debug'])
    expect(result.debug).toBe(true)
  })

  it('debug is undefined when --debug not supplied', () => {
    const result = parseRunArgs([])
    expect(result.debug).toBeUndefined()
  })

  it('--debug combined with other flags', () => {
    const result = parseRunArgs(['--debug', '--reset', '--agent', 'claude-cli'])
    expect(result.debug).toBe(true)
    expect(result.action).toBe('reset')
    expect(result.agentType).toBe('claude-cli')
  })

  // ── edge cases ────────────────────────────────────────────────────────────

  it('returns undefined for optional fields when not supplied', () => {
    const result = parseRunArgs([])
    expect(result.action).toBeUndefined()
    expect(result.agentType).toBeUndefined()
    expect(result.model).toBeUndefined()
    expect(result.scope).toBeUndefined()
    expect(result.score).toBeUndefined()
    expect(result.reworks).toBeUndefined()
    expect(result.steeringMessage).toBeUndefined()
    expect(result.mode).toBeUndefined()
  })

  it('ignores unknown flags gracefully', () => {
    expect(() => parseRunArgs(['--unknown', 'val', '--foo'])).not.toThrow()
  })

  it('returns NaN for --score with non-numeric value', () => {
    const result = parseRunArgs(['--score', 'abc'])
    expect(Number.isNaN(result.score)).toBe(true)
  })

  // ── --mode / -M ──────────────────────────────────────────────────────────

  it('mode is undefined when flag is omitted', () => {
    const result = parseRunArgs(['--reset'])
    expect(result.mode).toBeUndefined()
  })

  it('parses --mode quick', () => {
    expect(parseRunArgs(['--mode', 'quick']).mode).toBe('quick')
  })

  it('parses --mode fast', () => {
    expect(parseRunArgs(['--mode', 'fast']).mode).toBe('fast')
  })

  it('parses --mode default', () => {
    expect(parseRunArgs(['--mode', 'default']).mode).toBe('thinking')
  })

  it('parses --mode slow', () => {
    expect(parseRunArgs(['--mode', 'slow']).mode).toBe('deep_thinking')
  })

  it('parses -M alias for mode', () => {
    expect(parseRunArgs(['-M', 'fast']).mode).toBe('fast')
  })

  it('supports --mode=quick inline syntax', () => {
    expect(parseRunArgs(['--mode=quick']).mode).toBe('quick')
  })

  it('is case-insensitive for --mode value', () => {
    expect(parseRunArgs(['--mode', 'QUICK']).mode).toBe('quick')
  })

  it('ignores unknown mode value, leaves mode undefined', () => {
    expect(parseRunArgs(['--mode', 'turbo']).mode).toBeUndefined()
  })

  it('--mode coexists with other flags without interference', () => {
    const result = parseRunArgs(['--reset', '--mode', 'fast', '--debug'])
    expect(result.action).toBe('reset')
    expect(result.mode).toBe('fast')
    expect(result.debug).toBe(true)
  })

  // ── --skip-validation ─────────────────────────────────────────────────────

  it('parses --skip-validation flag', () => {
    const result = parseRunArgs(['--skip-validation'])
    expect(result.skipValidation).toBe(true)
  })

  it('skipValidation is undefined when flag not supplied', () => {
    const result = parseRunArgs([])
    expect(result.skipValidation).toBeUndefined()
  })

  it('--skip-validation coexists with other flags', () => {
    const result = parseRunArgs(['--reset', '--skip-validation', '--debug'])
    expect(result.action).toBe('reset')
    expect(result.skipValidation).toBe(true)
    expect(result.debug).toBe(true)
  })

  // ── --skip-memory ───────────────────────────────────────────────────────

  it('parses --skip-memory flag', () => {
    const result = parseRunArgs(['--skip-memory'])
    expect(result.skipMemory).toBe(true)
  })

  it('skipMemory is undefined when flag not supplied', () => {
    const result = parseRunArgs([])
    expect(result.skipMemory).toBeUndefined()
  })

  it('--skip-memory coexists with other flags', () => {
    const result = parseRunArgs(['--resume', '--skip-memory', '--debug'])
    expect(result.action).toBe('resume')
    expect(result.skipMemory).toBe(true)
    expect(result.debug).toBe(true)
  })


  it('--skip-validation and --skip-memory can be combined', () => {
    const result = parseRunArgs(['--skip-validation', '--skip-memory'])
    expect(result.skipValidation).toBe(true)
    expect(result.skipMemory).toBe(true)
  })

  // ── --skip-deploy ─────────────────────────────────────────────────────────

  it('parses --skip-deploy flag', () => {
    const result = parseRunArgs(['--skip-deploy'])
    expect(result.skipDeploy).toBe(true)
  })

  it('skipDeploy is undefined when flag not supplied', () => {
    const result = parseRunArgs([])
    expect(result.skipDeploy).toBeUndefined()
  })

  it('--skip-deploy coexists with other skip flags', () => {
    const result = parseRunArgs(['--skip-validation', '--skip-memory', '--skip-deploy'])
    expect(result.skipValidation).toBe(true)
    expect(result.skipMemory).toBe(true)
    expect(result.skipDeploy).toBe(true)
  })
})
