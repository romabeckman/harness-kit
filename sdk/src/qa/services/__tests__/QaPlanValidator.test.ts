import { describe, expect, it, vi } from 'vitest'
import { QaPlanValidator } from '../QaPlanValidator'
import type { QaPlan } from '../../types'

const workspace = '/tmp/qa-validator-workspace'

describe('QaPlanValidator', () => {
  it('accepts a complete HTTP API plan when its driver is available', async () => {
    const doctor = vi.fn().mockResolvedValue({ available: true })
    const validator = new QaPlanValidator({ doctor })

    const result = await validator.validate(plan(), workspace)

    expect(result).toEqual({ valid: true, errors: [] })
    expect(doctor).toHaveBeenCalledWith('api')
  })

  it('returns all structural, transport, scenario, and driver errors', async () => {
    const validator = new QaPlanValidator({
      doctor: vi.fn().mockResolvedValue({ available: false, reason: 'curl executable is unavailable' }),
    })
    const invalid = {
      schemaVersion: 2,
      id: '../unsafe-plan',
      version: 0,
      target: 'not a url',
      profile: 'api',
      createdAt: 'invalid-date',
      criteria: ['', 'Missing scenario'],
      scenarios: [{
        id: 'same', criterionIds: ['criterion-999'], required: false, profile: 'api',
        request: { method: 'TRACE', path: 'https://example.com/out', expectedStatus: 700 },
      }, {
        id: 'same', criterionIds: [], required: true, profile: 'web',
      }],
    }

    const result = await validator.validate(invalid, workspace)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      'schemaVersion must be 1',
      'plan id must be a safe identifier',
      'plan version must be a positive integer',
      'target must be a valid HTTP or HTTPS URL',
      'createdAt must be a valid date',
      'criteria must contain only non-empty strings',
      'scenario IDs must be unique',
      'scenario same must be required',
      'scenario same references unknown criterion criterion-999',
      'scenario same must use profile api',
      'scenario same request method is invalid',
      'scenario same request path must be relative to target origin',
      'scenario same expectedStatus must be an HTTP status between 100 and 599',
      'criterion-2 has no executable scenario',
      'api driver unavailable: curl executable is unavailable',
    ]))
  })

  it('validates profile-specific transports and CLI workspace targets', async () => {
    const validator = new QaPlanValidator({ doctor: vi.fn().mockResolvedValue({ available: true }) })
    const websocket = await validator.validate({
      ...plan(), profile: 'websocket', target: 'http://localhost:3000',
      scenarios: [{ id: 'socket', criterionIds: ['criterion-1'], required: true, profile: 'websocket', websocket: { messages: [], expectedMessages: [] } }],
    }, workspace)
    const cli = await validator.validate({
      ...plan(), profile: 'cli', target: '/path/that/does/not/exist',
      scenarios: [{ id: 'command', criterionIds: ['criterion-1'], required: true, profile: 'cli', cli: { command: '/bin/sh', args: ['-c', 'echo unsafe'], expectedExitCode: 0 } }],
    }, workspace)

    expect(websocket.errors).toEqual(expect.arrayContaining([
      'target must use ws:// or wss:// for websocket profiles',
      'scenario socket must define at least one expected WebSocket message',
    ]))
    expect(cli.errors).toEqual(expect.arrayContaining([
      'CLI target must be an existing directory',
      'scenario command CLI command must be a safe executable name without a path',
    ]))
  })

  it('validates structured MCP expectations', async () => {
    const validator = new QaPlanValidator({ doctor: vi.fn().mockResolvedValue({ available: true }) })
    const result = await validator.validate({
      schemaVersion: 1,
      id: 'mcp-plan',
      version: 1,
      target: 'https://qa.test/mcp',
      profile: 'mcp',
      createdAt: '2026-09-11T00:00:00.000Z',
      criteria: ['Tool reports a known empty state'],
      scenarios: [{
        id: 'empty',
        criterionIds: ['criterion-1'],
        required: true,
        profile: 'mcp',
        mcp: {
          method: 'tools/call',
          expectedState: 'empty',
          expectedReasonCode: 'no_match',
          expectedIsError: false,
        },
      }],
    }, workspace)

    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects malformed structured MCP expectations', async () => {
    const validator = new QaPlanValidator({ doctor: vi.fn().mockResolvedValue({ available: true }) })
    const result = await validator.validate({
      schemaVersion: 1,
      id: 'mcp-plan',
      version: 1,
      target: 'https://qa.test/mcp',
      profile: 'mcp',
      createdAt: '2026-09-11T00:00:00.000Z',
      criteria: ['Tool works'],
      scenarios: [{
        id: 'tool',
        criterionIds: ['criterion-1'],
        required: true,
        profile: 'mcp',
        mcp: {
          method: 'tools/call',
          expectedState: 42,
          expectedReasonCode: '',
          expectedIsError: 'false',
        },
      }],
    }, workspace)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      'scenario tool MCP expectedState must be a non-empty string',
      'scenario tool MCP expectedReasonCode must be a non-empty string',
      'scenario tool MCP expectedIsError must be a boolean',
    ]))
  })
})

function plan(): QaPlan {
  return {
    schemaVersion: 1,
    id: 'valid-plan',
    version: 1,
    target: 'http://127.0.0.1:3000/api',
    profile: 'api',
    createdAt: '2026-09-11T00:00:00.000Z',
    criteria: ['Health endpoint responds'],
    scenarios: [{
      id: 'health',
      criterionIds: ['criterion-1'],
      required: true,
      profile: 'api',
      request: { method: 'GET', path: '/health', expectedStatus: 200 },
    }],
  }
}
