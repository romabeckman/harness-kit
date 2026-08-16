import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CandidatePromotionService } from '../CandidatePromotionService'

describe('CandidatePromotionService', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'candidate-promo-test-'))
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
