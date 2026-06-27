import { describe, it, expect } from 'vitest'
import { AgentRunnerError, AgentRunnerErrorCode } from '../AgentRunnerError'

describe('AgentRunnerErrorCode', () => {
  it('has MISSING_API_KEY value', () => {
    expect(AgentRunnerErrorCode.MISSING_API_KEY).toBe('MISSING_API_KEY')
  })

  it('has TIMEOUT value', () => {
    expect(AgentRunnerErrorCode.TIMEOUT).toBe('TIMEOUT')
  })

  it('has API_ERROR value', () => {
    expect(AgentRunnerErrorCode.API_ERROR).toBe('API_ERROR')
  })

  it('has NETWORK_ERROR value', () => {
    expect(AgentRunnerErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR')
  })

  it('has QUOTA_EXCEEDED value', () => {
    expect(AgentRunnerErrorCode.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED')
  })

  it('has UNKNOWN_ERROR value', () => {
    expect(AgentRunnerErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR')
  })
})

describe('AgentRunnerError — new error codes', () => {
  it('sets code to QUOTA_EXCEEDED', () => {
    const err = new AgentRunnerError({
      code: AgentRunnerErrorCode.QUOTA_EXCEEDED,
      skill: 'scope-refinement',
      phase: 'dispatch',
      message: 'API quota exceeded: rate_limit_error',
    })
    expect(err.code).toBe(AgentRunnerErrorCode.QUOTA_EXCEEDED)
    expect(err.name).toBe('AgentRunnerError')
    expect(err.skill).toBe('scope-refinement')
  })

  it('sets code to UNKNOWN_ERROR', () => {
    const err = new AgentRunnerError({
      code: AgentRunnerErrorCode.UNKNOWN_ERROR,
      skill: 'tdd-orchestrator',
      phase: 'dispatch',
      message: 'Unexpected error occurred',
    })
    expect(err.code).toBe(AgentRunnerErrorCode.UNKNOWN_ERROR)
    expect(err.name).toBe('AgentRunnerError')
  })

  it('QUOTA_EXCEEDED preserves cause', () => {
    const cause = new Error('upstream 429')
    const err = new AgentRunnerError({
      code: AgentRunnerErrorCode.QUOTA_EXCEEDED,
      skill: 'unknown',
      phase: 'dispatch',
      message: 'rate limit hit',
      cause,
    })
    expect(err.cause).toBe(cause)
  })
})

describe('AgentRunnerError', () => {
  const baseParams = {
    code: AgentRunnerErrorCode.MISSING_API_KEY,
    skill: 'unknown',
    phase: 'construction',
    message: 'ANTHROPIC_API_KEY environment variable is not set',
  }

  it('is an instance of Error', () => {
    const err = new AgentRunnerError(baseParams)
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of AgentRunnerError', () => {
    const err = new AgentRunnerError(baseParams)
    expect(err).toBeInstanceOf(AgentRunnerError)
  })

  it('sets name to AgentRunnerError', () => {
    const err = new AgentRunnerError(baseParams)
    expect(err.name).toBe('AgentRunnerError')
  })

  it('sets code from params', () => {
    const err = new AgentRunnerError(baseParams)
    expect(err.code).toBe(AgentRunnerErrorCode.MISSING_API_KEY)
  })

  it('sets skill from params', () => {
    const err = new AgentRunnerError(baseParams)
    expect(err.skill).toBe('unknown')
  })

  it('sets phase from params', () => {
    const err = new AgentRunnerError(baseParams)
    expect(err.phase).toBe('construction')
  })

  it('sets message from params', () => {
    const err = new AgentRunnerError(baseParams)
    expect(err.message).toBe('ANTHROPIC_API_KEY environment variable is not set')
  })

  it('sets cause to undefined when not provided', () => {
    const err = new AgentRunnerError(baseParams)
    expect(err.cause).toBeUndefined()
  })

  it('sets cause when provided', () => {
    const originalErr = new Error('original error')
    const err = new AgentRunnerError({ ...baseParams, cause: originalErr })
    expect(err.cause).toBe(originalErr)
  })

  it('sets code to TIMEOUT', () => {
    const err = new AgentRunnerError({
      code: AgentRunnerErrorCode.TIMEOUT,
      skill: 'tdd-orchestrator',
      phase: 'dispatch',
      message: 'Request timed out',
    })
    expect(err.code).toBe(AgentRunnerErrorCode.TIMEOUT)
  })

  it('sets code to API_ERROR', () => {
    const err = new AgentRunnerError({
      code: AgentRunnerErrorCode.API_ERROR,
      skill: 'tdd-orchestrator',
      phase: 'dispatch',
      message: 'API returned 401',
    })
    expect(err.code).toBe(AgentRunnerErrorCode.API_ERROR)
  })

  it('sets code to NETWORK_ERROR', () => {
    const err = new AgentRunnerError({
      code: AgentRunnerErrorCode.NETWORK_ERROR,
      skill: 'tdd-orchestrator',
      phase: 'dispatch',
      message: 'Network connection failed',
    })
    expect(err.code).toBe(AgentRunnerErrorCode.NETWORK_ERROR)
  })
})
