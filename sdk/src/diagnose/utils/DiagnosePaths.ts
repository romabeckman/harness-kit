import { join } from 'node:path'

export class DiagnosePaths {
  static productDir(workspacePath: string): string {
    return join(workspacePath, 'docs', 'product')
  }

  static ledgerPath(workspacePath: string): string {
    return join(workspacePath, 'docs', 'product', 'diagnose-sessions.jsonl')
  }

  static harnessHistoryDir(workspacePath: string): string {
    return join(workspacePath, 'docs', 'harness-history')
  }

  static tracesDir(workspacePath: string): string {
    return join(workspacePath, 'docs', 'harness-history', 'traces')
  }

  static sessionTraceDir(workspacePath: string, sessionId: string): string {
    return join(workspacePath, 'docs', 'harness-history', 'traces', sessionId)
  }

  static candidatesDir(workspacePath: string): string {
    return join(workspacePath, 'docs', 'harness-history', 'candidates')
  }

  static candidateDir(workspacePath: string, candidateId: string): string {
    return join(workspacePath, 'docs', 'harness-history', 'candidates', candidateId)
  }

  static candidateRationalePath(workspacePath: string, candidateId: string): string {
    return join(workspacePath, 'docs', 'harness-history', 'candidates', candidateId, 'rationale.md')
  }

  static candidateScorePath(workspacePath: string, candidateId: string): string {
    return join(workspacePath, 'docs', 'harness-history', 'candidates', candidateId, 'score.md')
  }

  static candidateSkillPath(workspacePath: string, candidateId: string): string {
    return join(workspacePath, 'docs', 'harness-history', 'candidates', candidateId, 'SKILL.md')
  }

  static candidateDiffPath(workspacePath: string, candidateId: string): string {
    return join(workspacePath, 'docs', 'harness-history', 'candidates', candidateId, 'diff.md')
  }

  static paretoFrontierPath(workspacePath: string): string {
    return join(workspacePath, 'docs', 'harness-history', 'pareto-frontier.md')
  }

  static toForwardSlashes(pathStr: string): string {
    return pathStr.replace(/\\/g, '/')
  }
}
