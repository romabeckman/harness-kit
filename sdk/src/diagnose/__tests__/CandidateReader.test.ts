import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CandidateReader } from '../CandidateReader'
import type { AgentOutput } from '../../agent-runner/types'

describe('CandidateReader', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'candidate-reader-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('extracts candidate info from parsedJson in AgentOutput without workingDir', () => {
    const output: any = {
      success: true,
      raw: 'Some raw response',
      parsedJson: {
        candidateId: 'v001',
        targetSkill: 'autonomous-orchestrator',
        status: 'PROPOSED',
        decision: {
          action: 'EVALUATE_CANDIDATE',
          scoreImprovement: 0.15,
        },
      },
    }

    const candidate = CandidateReader.extractCandidateFromAgentOutput(output)
    expect(candidate).not.toBeNull()
    expect(candidate?.candidateId).toBe('v001')
    expect(candidate?.targetSkill).toBe('autonomous-orchestrator')
    expect(candidate?.status).toBe('PROPOSED')
    expect(candidate?.action).toBe('EVALUATE_CANDIDATE')
  })

  it('extracts candidate info from parsedJson and enriches with disk info when candidate exists on disk', () => {
    const candidateDir = join(tmpDir, 'docs', 'harness-history', 'candidates', 'v001')
    mkdirSync(candidateDir, { recursive: true })
    writeFileSync(
      join(candidateDir, 'rationale.md'),
      '## Target Skill\nautonomous-orchestrator\n\n## Diagnosis\nPhase C timeout\n',
      'utf8'
    )

    const output: any = {
      success: true,
      raw: 'Some raw response',
      parsedJson: {
        candidateId: 'v001',
        targetSkill: 'autonomous-orchestrator',
        status: 'PROPOSED',
        decision: {
          action: 'EVALUATE_CANDIDATE',
        },
      },
    }

    const candidate = CandidateReader.extractCandidateFromAgentOutput(output, tmpDir)
    expect(candidate).not.toBeNull()
    expect(candidate?.candidateId).toBe('v001')
    expect(candidate?.rationale).toContain('Phase C timeout')
  })

  it('extracts candidate info from parsedJson in AgentOutput with workingDir', () => {
    const output: any = {
      success: true,
      raw: 'Some raw response',
      parsedJson: {
        candidateId: 'v099',
        targetSkill: 'autonomous-orchestrator',
      },
    }

    const candidate = CandidateReader.extractCandidateFromAgentOutput(output, tmpDir)
    expect(candidate).not.toBeNull()
    expect(candidate?.candidateId).toBe('v099')
    expect(candidate?.targetSkill).toBe('autonomous-orchestrator')
  })

  it('extracts candidate info from fenced JSON in raw AgentOutput text without workingDir', () => {
    const rawText = `
Here is my evaluation:
\`\`\`json
{
  "candidateId": "v002",
  "targetSkill": "tdd-orchestrator",
  "status": "PROPOSED",
  "decision": {
    "action": "EVALUATE_CANDIDATE"
  }
}
\`\`\`
`
    const output: AgentOutput = {
      success: true,
      raw: rawText,
    }

    const candidate = CandidateReader.extractCandidateFromAgentOutput(output)
    expect(candidate).not.toBeNull()
    expect(candidate?.candidateId).toBe('v002')
    expect(candidate?.targetSkill).toBe('tdd-orchestrator')
    expect(candidate?.status).toBe('PROPOSED')
    expect(candidate?.action).toBe('EVALUATE_CANDIDATE')
  })

  it('reads candidate metadata from disk directory docs/harness-history/candidates/v001', () => {
    const candidateDir = join(tmpDir, 'docs', 'harness-history', 'candidates', 'v001')
    mkdirSync(candidateDir, { recursive: true })

    const rationaleContent = `# Candidate Rationale

## Target Skill
autonomous-orchestrator

## Diagnosis
Worst sessions failed at phase C with timeout divergence.

## Proposed Change
Increase timeout and add circuit breaker.
`
    writeFileSync(join(candidateDir, 'rationale.md'), rationaleContent, 'utf8')
    writeFileSync(join(candidateDir, 'score.md'), 'evaluated: false\npromoted: false\n', 'utf8')

    const candidate = CandidateReader.readCandidateFromDisk(tmpDir, 'v001')
    expect(candidate).not.toBeNull()
    expect(candidate?.candidateId).toBe('v001')
    expect(candidate?.targetSkill).toBe('autonomous-orchestrator')
    expect(candidate?.rationale).toContain('Worst sessions failed at phase C')
    expect(candidate?.proposedChange).toContain('Increase timeout and add circuit breaker')
  })

  it('finds latest candidate from disk when candidateId is not specified', () => {
    const baseDir = join(tmpDir, 'docs', 'harness-history', 'candidates')
    mkdirSync(join(baseDir, 'v001'), { recursive: true })
    mkdirSync(join(baseDir, 'v002'), { recursive: true })

    writeFileSync(
      join(baseDir, 'v002', 'rationale.md'),
      '## Target Skill\nmeta-harness\n\n## Proposed Change\nOptimize prompt\n',
      'utf8'
    )

    const candidate = CandidateReader.readCandidateFromDisk(tmpDir)
    expect(candidate).not.toBeNull()
    expect(candidate?.candidateId).toBe('v002')
    expect(candidate?.targetSkill).toBe('meta-harness')
  })

  it('returns null when no candidate exists on disk or in agent output', () => {
    const output: AgentOutput = {
      success: true,
      raw: 'No candidate was created during this diagnosis.',
    }

    const candidate = CandidateReader.resolveCandidate(output, tmpDir)
    expect(candidate).toBeNull()
  })

  it('detects PROMOTED status when score.md has promoted: true', () => {
    const candidateDir = join(tmpDir, 'docs', 'harness-history', 'candidates', 'v001')
    mkdirSync(candidateDir, { recursive: true })
    writeFileSync(join(candidateDir, 'score.md'), 'promoted: true\n', 'utf8')

    const status = CandidateReader.getCandidateStatus(tmpDir, 'v001', 'tdd-orchestrator')
    expect(status).toBe('PROMOTED')
  })

  it('detects APPLIED status when candidate SKILL.md matches active workspace skill', () => {
    const candidateDir = join(tmpDir, 'docs', 'harness-history', 'candidates', 'v001')
    mkdirSync(candidateDir, { recursive: true })
    writeFileSync(join(candidateDir, 'score.md'), 'promoted: false\n', 'utf8')
    writeFileSync(join(candidateDir, 'SKILL.md'), '# Improved Skill Content', 'utf8')

    const activeSkillDir = join(tmpDir, 'skills', 'tdd-orchestrator')
    mkdirSync(activeSkillDir, { recursive: true })
    writeFileSync(join(activeSkillDir, 'SKILL.md'), '# Improved Skill Content', 'utf8')

    const status = CandidateReader.getCandidateStatus(tmpDir, 'v001', 'tdd-orchestrator')
    expect(status).toBe('APPLIED')
  })

  it('detects PROPOSED status when candidate is unpromoted and does not match active skill', () => {
    const candidateDir = join(tmpDir, 'docs', 'harness-history', 'candidates', 'v001')
    mkdirSync(candidateDir, { recursive: true })
    writeFileSync(join(candidateDir, 'score.md'), 'promoted: false\n', 'utf8')
    writeFileSync(join(candidateDir, 'SKILL.md'), '# Improved Skill Content', 'utf8')

    const activeSkillDir = join(tmpDir, 'skills', 'tdd-orchestrator')
    mkdirSync(activeSkillDir, { recursive: true })
    writeFileSync(join(activeSkillDir, 'SKILL.md'), '# Old Skill Content', 'utf8')

    const status = CandidateReader.getCandidateStatus(tmpDir, 'v001', 'tdd-orchestrator')
    expect(status).toBe('PROPOSED')
  })
})
