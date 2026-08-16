import { describe, it, expect } from 'vitest'
import { parseStandardRunnerArgs } from '../runner-args-parser'

describe('parseStandardRunnerArgs', () => {
  it('parses --agent and -a flags', () => {
    expect(parseStandardRunnerArgs(['--agent', 'claude-cli'])).toEqual({
      agentType: 'claude-cli',
      restArgs: [],
    })
    expect(parseStandardRunnerArgs(['-a', 'antigravity-cli'])).toEqual({
      agentType: 'antigravity-cli',
      restArgs: [],
    })
    expect(parseStandardRunnerArgs(['--agent=copilot-cli'])).toEqual({
      agentType: 'copilot-cli',
      restArgs: [],
    })
  })

  it('parses --model and -m flags', () => {
    expect(parseStandardRunnerArgs(['--model', 'gemini-3.7-flash'])).toEqual({
      model: 'gemini-3.7-flash',
      restArgs: [],
    })
    expect(parseStandardRunnerArgs(['-m', 'claude-sonnet-4.5'])).toEqual({
      model: 'claude-sonnet-4.5',
      restArgs: [],
    })
    expect(parseStandardRunnerArgs(['--model=gpt-5.6-turbo'])).toEqual({
      model: 'gpt-5.6-turbo',
      restArgs: [],
    })
  })

  it('parses --effort and -e flags', () => {
    expect(parseStandardRunnerArgs(['--effort', 'high'])).toEqual({
      effort: 'high',
      restArgs: [],
    })
    expect(parseStandardRunnerArgs(['-e', 'low'])).toEqual({
      effort: 'low',
      restArgs: [],
    })
    expect(parseStandardRunnerArgs(['--effort=medium'])).toEqual({
      effort: 'medium',
      restArgs: [],
    })
  })

  it('preserves restArgs for command-specific arguments', () => {
    const result = parseStandardRunnerArgs([
      'review',
      'v001',
      '--agent',
      'antigravity-cli',
      '--auto',
      '--effort',
      'high',
    ])

    expect(result.agentType).toBe('antigravity-cli')
    expect(result.effort).toBe('high')
    expect(result.restArgs).toEqual(['review', 'v001', '--auto'])
  })
})
