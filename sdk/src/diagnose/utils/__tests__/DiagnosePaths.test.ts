import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { DiagnosePaths } from '../DiagnosePaths'

describe('DiagnosePaths utility', () => {
  const ws = '/test/workspace'

  it('generates correct ledger and product paths using join', () => {
    expect(DiagnosePaths.productDir(ws)).toBe(join(ws, 'docs', 'product'))
    expect(DiagnosePaths.ledgerPath(ws)).toBe(join(ws, 'docs', 'product', 'diagnose-sessions.jsonl'))
  })

  it('generates correct history and traces paths using join', () => {
    expect(DiagnosePaths.harnessHistoryDir(ws)).toBe(join(ws, 'docs', 'harness-history'))
    expect(DiagnosePaths.tracesDir(ws)).toBe(join(ws, 'docs', 'harness-history', 'traces'))
    expect(DiagnosePaths.sessionTraceDir(ws, 'session-001')).toBe(
      join(ws, 'docs', 'harness-history', 'traces', 'session-001')
    )
  })

  it('generates correct candidate and file paths using join', () => {
    expect(DiagnosePaths.candidatesDir(ws)).toBe(join(ws, 'docs', 'harness-history', 'candidates'))
    expect(DiagnosePaths.candidateDir(ws, 'v001')).toBe(
      join(ws, 'docs', 'harness-history', 'candidates', 'v001')
    )
    expect(DiagnosePaths.candidateRationalePath(ws, 'v001')).toBe(
      join(ws, 'docs', 'harness-history', 'candidates', 'v001', 'rationale.md')
    )
    expect(DiagnosePaths.candidateScorePath(ws, 'v001')).toBe(
      join(ws, 'docs', 'harness-history', 'candidates', 'v001', 'score.md')
    )
    expect(DiagnosePaths.candidateSkillPath(ws, 'v001')).toBe(
      join(ws, 'docs', 'harness-history', 'candidates', 'v001', 'SKILL.md')
    )
    expect(DiagnosePaths.candidateDiffPath(ws, 'v001')).toBe(
      join(ws, 'docs', 'harness-history', 'candidates', 'v001', 'diff.md')
    )
    expect(DiagnosePaths.paretoFrontierPath(ws)).toBe(
      join(ws, 'docs', 'harness-history', 'pareto-frontier.md')
    )
  })

  it('normalizes paths to forward slashes', () => {
    expect(DiagnosePaths.toForwardSlashes('C:\\project\\docs\\history')).toBe('C:/project/docs/history')
    expect(DiagnosePaths.toForwardSlashes('/unix/style/path')).toBe('/unix/style/path')
  })
})
