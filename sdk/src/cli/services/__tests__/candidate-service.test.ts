import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cmdCandidate } from '../candidate-service'
import { AgentRunnerFactory } from '../../../agent-runner/AgentRunnerFactory'
import { writeCandidate, writeEvaluatedCandidate } from '../../../diagnose/__tests__/fixtures'

const prompts = vi.hoisted(() => ({ select: vi.fn() }))

vi.mock('@inquirer/prompts', () => prompts)

vi.mock('../../../agent-runner/AgentRunnerFactory', () => ({
  AgentRunnerFactory: {
    create: vi.fn(() => ({
      type: 'mock-runner',
      run: vi.fn().mockResolvedValue({ success: true, raw: 'Promoted' }),
    })),
  },
}))

describe('cmdCandidate CLI Service', () => {
  let tmpDir: string
  let consoleLogSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    prompts.select.mockReset()
    vi.mocked(AgentRunnerFactory.create).mockClear()
    tmpDir = mkdtempSync(join(tmpdir(), 'harness-cli-candidate-'))
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('lists candidates with cmdCandidate list', async () => {
    const candidatesDir = join(tmpDir, 'docs', 'harness-history', 'candidates', 'v001')
    mkdirSync(candidatesDir, { recursive: true })
    writeFileSync(
      join(candidatesDir, 'rationale.md'),
      '## Target Skill\ntdd-orchestrator\n## Diagnosis\nSample diagnosis\n',
      'utf8'
    )
    writeFileSync(join(candidatesDir, 'score.md'), 'promoted: false\n', 'utf8')

    await cmdCandidate(tmpDir, ['list'])
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('v001'))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('tdd-orchestrator'))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('PROPOSED'))
  })

  it('applies the evaluated bytes with cmdCandidate review --auto', async () => {
    const { activePath, candidate } = writeEvaluatedCandidate(tmpDir)

    await cmdCandidate(tmpDir, ['review', 'v001', '--auto'])

    expect(prompts.select).not.toHaveBeenCalled()
    expect(AgentRunnerFactory.create).not.toHaveBeenCalled()
    expect(readFileSync(activePath, 'utf8')).toBe(candidate)
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('promoted to the active skill'))
  })

  it('rejects --auto for a candidate without evaluation evidence', async () => {
    writeCandidate(tmpDir)

    await cmdCandidate(tmpDir, ['review', 'v001', '--auto', '--agent', 'antigravity-cli'])
    expect(prompts.select).not.toHaveBeenCalled()
    expect(AgentRunnerFactory.create).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Candidate promotion encountered an error'),
      expect.stringContaining('evaluation results are required'),
    )
  })

  it('prints error when candidate is missing on review', async () => {
    await cmdCandidate(tmpDir, ['review', 'v999'])
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Candidate v999 not found'))
  })
})
