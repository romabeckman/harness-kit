import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CandidatePromotionService } from '../CandidatePromotionService'
import { DiagnosePaths } from '../utils/DiagnosePaths'
import { writeCandidate, writeEvaluatedCandidate } from './fixtures'

const review = vi.hoisted(() => ({ launch: vi.fn(), confirm: vi.fn() }))
vi.mock('cross-spawn', () => ({ default: { sync: review.launch } }))
vi.mock('@inquirer/prompts', () => ({ confirm: review.confirm }))

describe('CandidatePromotionService', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'candidate-promo-test-'))
    review.launch.mockReset()
    review.confirm.mockReset()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('builds interactive prompt with candidate paths and clear guidance', () => {
    const prompt = CandidatePromotionService.buildPrompt(tmpDir, 'v001', 'tdd-orchestrator')
    expect(prompt).toContain('candidate v001')
    expect(prompt).toContain('tdd-orchestrator')
    expect(prompt).toContain('diff.md')
    expect(prompt).toContain('rationale.md')
    expect(prompt).toContain('SKILL.md')
    expect(prompt).toContain('score.md')
    expect(prompt).toContain('read-only review')
  })

  it('blocks promotion when the evaluated baseline has changed', () => {
    const { activePath, candidateId, targetSkill } = writeEvaluatedCandidate(tmpDir)
    writeFileSync(activePath, 'New active contents')

    expect(() => CandidatePromotionService.promote(tmpDir, candidateId, targetSkill)).toThrow('differs from the evaluated baseline')
    expect(readFileSync(activePath, 'utf8')).toBe('New active contents')
    expect(readFileSync(DiagnosePaths.candidateScorePath(tmpDir, candidateId), 'utf8')).toContain('promoted: false')
  })

  it('requires an evaluation summary before changing the active skill', () => {
    writeCandidate(tmpDir)
    expect(() => CandidatePromotionService.promote(tmpDir, 'v001', 'tdd-orchestrator')).toThrow('evaluation results are required')
  })

  it.each([true, false])('honors human approval in interactive review (%s)', async approved => {
    const { activePath, candidate, candidateId, targetSkill } = writeEvaluatedCandidate(tmpDir)
    const baseline = readFileSync(activePath, 'utf8')
    review.launch.mockReturnValue({ status: 0 })
    review.confirm.mockResolvedValue(approved)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await expect(CandidatePromotionService.launchInteractive('codex-cli', candidateId, targetSkill, tmpDir))
        .resolves.toBe(true)
      expect(review.confirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }))
      expect(readFileSync(activePath, 'utf8')).toBe(approved ? candidate : baseline)
      expect(readFileSync(DiagnosePaths.candidateScorePath(tmpDir, candidateId), 'utf8')).toContain(`promoted: ${approved}`)
    } finally {
      log.mockRestore()
    }
  })

  it('builds runner command line string for all CLI runners', () => {
    const claudeCmd = CandidatePromotionService.buildRunnerCommand('claude-cli', 'v001', 'tdd-orchestrator', tmpDir)
    expect(claudeCmd).toContain('claude')
    expect(claudeCmd).toContain('v001')

    const agyCmd = CandidatePromotionService.buildRunnerCommand('antigravity-cli', 'v001', 'tdd-orchestrator', tmpDir)
    expect(agyCmd).toContain('agy')
    expect(agyCmd).toContain('--prompt')

    const copilotCmd = CandidatePromotionService.buildRunnerCommand('copilot-cli', 'v001', 'tdd-orchestrator', tmpDir)
    expect(copilotCmd).toContain('copilot')
    expect(copilotCmd).toContain('--prompt')

    const codexCmd = CandidatePromotionService.buildRunnerCommand('codex-cli', 'v001', 'tdd-orchestrator', tmpDir)
    expect(codexCmd).toContain('codex')

    const cursorCmd = CandidatePromotionService.buildRunnerCommand('cursor-cli', 'v001', 'tdd-orchestrator', tmpDir)
    expect(cursorCmd).toContain('agent')

    const kiroCmd = CandidatePromotionService.buildRunnerCommand('kiro-cli', 'v001', 'tdd-orchestrator', tmpDir)
    expect(kiroCmd).toContain('kiro-cli')
    expect(kiroCmd).toContain('chat')
  })
})
