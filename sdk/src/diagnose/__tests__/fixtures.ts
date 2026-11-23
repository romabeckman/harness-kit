import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DiagnosePaths } from '../utils/DiagnosePaths'

export function writeTrace(workspace: string, traceId: string, sourceId?: string, emptyFile?: string): void {
  const directory = DiagnosePaths.sessionTraceDir(workspace, traceId)
  mkdirSync(directory, { recursive: true })
  const metadata = sourceId
    ? [
      `- **session_id:** ${traceId}`,
      `- **source_session_id:** ${sourceId}`,
      ...['skill_chain', 'skill_versions', 'task_type', 'model', 'effort', 'budget', 'benchmark_id', 'task_id'].map(
        field => `- **${field}:** unknown`,
      ),
    ].join('\n')
    : '# Legacy evidence'
  const score = '- **outcome:** unknown\n- **outcome_evidence:** No acceptance report\n'
  for (const [name, content] of Object.entries({
    'metadata.md': metadata,
    'score.md': score,
    'input.md': '# Input',
    'steps.md': '# Steps',
    'verdict.md': '# Verdict',
  })) {
    writeFileSync(join(directory, name), name === emptyFile ? '' : content, 'utf8')
  }
}

export function writeLegacyHistory(workspace: string, count = 3): void {
  for (let index = 1; index <= count; index++) {
    writeTrace(workspace, `session-2026-08-15-${String(index).padStart(3, '0')}`)
  }
}

export function writeCandidate(workspace: string, candidateId = 'v001', targetSkill = 'tdd-orchestrator'): void {
  const dir = DiagnosePaths.candidateDir(workspace, candidateId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'rationale.md'), `## Target Skill\n${targetSkill}\n\n## Diagnosis\nTimeout\n\n## Proposed Change\nAdd limit\n`)
  writeFileSync(join(dir, 'diff.md'), '+ Add limit\n')
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${targetSkill}\ndescription: Candidate\n---\nAdd limit.\n`)
  writeFileSync(join(dir, 'score.md'), 'evaluated: false\npromoted: false\n')
}

export function writeEvaluatedCandidate(workspace: string) {
  const candidateId = 'v001'
  const targetSkill = 'tdd-orchestrator'
  writeCandidate(workspace, candidateId, targetSkill)
  const activePath = join(workspace, 'skills', targetSkill, 'SKILL.md')
  const baseline = `---\nname: ${targetSkill}\ndescription: Baseline\n---\nOriginal instructions.\n`
  const candidate = `---\nname: ${targetSkill}\ndescription: Candidate\n---\nAdd limit.\n`
  mkdirSync(dirname(activePath), { recursive: true })
  writeFileSync(activePath, baseline)
  const evaluationPath = DiagnosePaths.candidateEvaluationPath(workspace, candidateId)
  mkdirSync(dirname(evaluationPath), { recursive: true })
  const result = { paired: true, decision: 'improved', cases: 3, baselinePasses: 2, candidatePasses: 3 }
  writeFileSync(evaluationPath, JSON.stringify({
    candidateId,
    targetSkill,
    baselineSha256: createHash('sha256').update(baseline).digest('hex'),
    candidateSha256: createHash('sha256').update(candidate).digest('hex'),
    search: { ...result, taskSetId: 'search-v1' },
    holdout: { ...result, taskSetId: 'reserved-v1' },
  }))
  return { activePath, candidate, candidateId, targetSkill, evaluationPath }
}
