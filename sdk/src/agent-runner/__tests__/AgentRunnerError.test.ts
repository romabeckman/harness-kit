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
