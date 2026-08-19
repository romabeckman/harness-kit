import { describe, it, expect } from 'vitest'
import {
  SessionStatus,
  SessionSnapshot,
  DiagnoseSessionRecord,
  DiagnoseSettings,
  isSessionStatus,
  sanitizeSessionSnapshot,
} from '../types'

describe('Diagnose Domain Types & Helpers', () => {
  it('identifies valid and invalid SessionStatus', () => {
    expect(isSessionStatus('pending')).toBe(true)
    expect(isSessionStatus('completed')).toBe(true)
    expect(isSessionStatus('failed')).toBe(false)
    expect(isSessionStatus('skipped')).toBe(false)
    expect(isSessionStatus('')).toBe(false)
    expect(isSessionStatus(null)).toBe(false)
    expect(isSessionStatus(undefined)).toBe(false)
  })

  it('validates SessionSnapshot structure', () => {
    const snapshot: SessionSnapshot = {
      runner: 'claude-cli',
      model: 'anthropic.claude-5-sonnet',
      effort: 'medium',
      scopeSummary: 'Add diagnose feature',
      featureIds: ['F001', 'F002'],
      phaseTimingsMs: { BOOTSTRAP: 1200, PLANNING: 3500 },
    }
    expect(snapshot.runner).toBe('claude-cli')
    expect(snapshot.featureIds).toHaveLength(2)
  })

  it('sanitizes SessionSnapshot by removing sensitive env variables and api keys', () => {
    const raw: any = {
      runner: 'copilot-cli',
      model: 'gpt-5.6-luna',
      effort: 'xhigh',
      scopeSummary: 'Test Scope',
      featureIds: ['F001'],
      phaseTimingsMs: { BOOTSTRAP: 500 },
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      OPENAI_API_KEY: 'sk-secret',
      env: { SECRET: '123' },
    }

    const sanitized = sanitizeSessionSnapshot(raw)
    expect(sanitized.runner).toBe('copilot-cli')
    expect(sanitized.model).toBe('gpt-5.6-luna')
    expect(sanitized.effort).toBe('xhigh')
    expect(sanitized.scopeSummary).toBe('Test Scope')
    expect(sanitized.featureIds).toEqual(['F001'])
    expect(sanitized.phaseTimingsMs).toEqual({ BOOTSTRAP: 500 })
    expect((sanitized as any).ANTHROPIC_API_KEY).toBeUndefined()
    expect((sanitized as any).OPENAI_API_KEY).toBeUndefined()
    expect((sanitized as any).env).toBeUndefined()
  })

  it('validates DiagnoseSessionRecord structure', () => {
    const record: DiagnoseSessionRecord = {
      sessionId: 'session-2026-08-15-001',
      runner: 'antigravity-cli',
      agent: 'developer-backend',
      phase: 'DEVELOPMENT',
      domain: 'auth-service',
      status: 'pending',
      snapshot: {
        runner: 'antigravity-cli',
        model: 'gemini-3.7-flash',
        effort: 'low',
        scopeSummary: 'Test',
        featureIds: [],
        phaseTimingsMs: {},
      },
      timestamp: '2026-08-15T20:00:00.000Z',
    }

    expect(record.sessionId).toBe('session-2026-08-15-001')
    expect(record.phase).toBe('DEVELOPMENT')
    expect(record.domain).toBe('auth-service')
    expect(record.status).toBe('pending')
  })

  it('validates DiagnoseSettings structure', () => {
    const settings: DiagnoseSettings = {
      model: 'gpt-5.6-luna',
      effort: 'xhigh',
    }
    expect(settings.model).toBe('gpt-5.6-luna')
    expect(settings.effort).toBe('xhigh')
  })
})
