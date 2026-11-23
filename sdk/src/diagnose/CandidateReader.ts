import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AgentOutput } from '../agent-runner/types'
import { JsonExtractionProtocol } from '../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../json-extraction/types'
import type { CandidateReportInfo, DiagnoseReportData } from './types'
import { isCandidateId, isSkillName } from './types'
import { DiagnosePaths } from './utils/DiagnosePaths'

export class CandidateReader {
  static listCandidateIds(workingDir: string): string[] {
    const root = DiagnosePaths.candidatesDir(workingDir)
    if (!existsSync(root)) return []
    return readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && isCandidateId(entry.name))
      .map(entry => entry.name)
  }

  static getCandidateStatus(
    workingDir: string,
    candidateId: string,
    targetSkill?: string
  ): 'PROMOTED' | 'APPLIED' | 'PROPOSED' {
    if (!isCandidateId(candidateId)) return 'PROPOSED'
    const scorePath = DiagnosePaths.candidateScorePath(workingDir, candidateId)
    if (existsSync(scorePath)) {
      try {
        const scoreContent = readFileSync(scorePath, 'utf8')
        if (/^\s*(?:-\s*)?(?:promoted:\s*true|status:\s*PROMOTED)[ \t]*$/im.test(scoreContent)) {
          return 'PROMOTED'
        }
      } catch {
        // ignore
      }
    }

    if (isSkillName(targetSkill) && targetSkill !== 'unknown') {
      const candidateSkillPath = DiagnosePaths.candidateSkillPath(workingDir, candidateId)
      if (existsSync(candidateSkillPath)) {
        try {
          const candidateSkillContent = readFileSync(candidateSkillPath, 'utf8').trim()
          const candidateDestinations = [
            join(workingDir, 'skills', targetSkill, 'SKILL.md'),
            join(workingDir, '..', 'skills', targetSkill, 'SKILL.md'),
            join(homedir(), '.gemini', 'config', 'plugins', 'harness-kit', 'skills', targetSkill, 'SKILL.md'),
            join(homedir(), '.claude-plugin', 'harness-kit', 'skills', targetSkill, 'SKILL.md'),
          ]

          for (const activePath of candidateDestinations) {
            if (existsSync(activePath)) {
              const activeContent = readFileSync(activePath, 'utf8').trim()
              if (activeContent === candidateSkillContent) {
                return 'APPLIED'
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    return 'PROPOSED'
  }
  static extractCandidateFromAgentOutput(
    output: AgentOutput,
    workingDir?: string
  ): CandidateReportInfo | null {
    const data: any = CandidateReader.readOutputData(output)

    if (data && typeof data === 'object' && (data.candidateId || data.candidate_id)) {
      const candidateId = data.candidateId ?? data.candidate_id
      if (!isCandidateId(candidateId)) return null
      const targetSkill = String(data.targetSkill ?? data.target_skill ?? 'unknown')
      const status = data.status ? String(data.status) : 'PROPOSED'
      const action = data.decision?.action ? String(data.decision.action) : undefined
      const path = join('docs', 'harness-history', 'candidates', candidateId).replace(/\\/g, '/')

      const candidate: CandidateReportInfo = {
        candidateId,
        targetSkill,
        status,
        path,
        action,
      }

      if (workingDir) {
        const diskInfo = CandidateReader.readCandidateFromDisk(workingDir, candidateId)
        if (diskInfo) {
          if (diskInfo.rationale) candidate.rationale = diskInfo.rationale
          if (diskInfo.proposedChange) candidate.proposedChange = diskInfo.proposedChange
          if (targetSkill === 'unknown' && diskInfo.targetSkill) {
            candidate.targetSkill = diskInfo.targetSkill
          }
        }
      }

      return candidate
    }

    return null
  }

  private static readOutputData(output: AgentOutput): unknown {
    const parsedJson = (output as AgentOutput & { parsedJson?: unknown }).parsedJson
    if (parsedJson) return parsedJson
    const result = JsonExtractionProtocol.extract(output.raw)
    return isExtractionResult(result) ? result.data : undefined
  }

  static resolveProposal(
    output: AgentOutput,
    workingDir: string,
    existingCandidates: readonly string[] = [],
  ): Pick<DiagnoseReportData, 'candidateCreated' | 'optimization'> {
    if (output.success === false) {
      return { candidateCreated: null, optimization: { status: 'failed', reason: 'The optimization runner failed.' } }
    }
    const data = CandidateReader.readOutputData(output)
    if (data && typeof data === 'object' && 'status' in data && (data.status === 'blocked' || data.status === 'no_candidate')) {
      const reason = 'decision' in data && typeof data.decision === 'string' && data.decision.trim()
        ? data.decision.trim()
        : 'The optimizer did not provide a reason.'
      return { candidateCreated: null, optimization: { status: data.status, reason } }
    }
    const candidate = CandidateReader.extractCandidateFromAgentOutput(output)
    if (candidate?.status === 'PROPOSED' && candidate.action === 'EVALUATE_CANDIDATE'
      && isSkillName(candidate.targetSkill) && candidate.targetSkill !== 'unknown'
      && !existingCandidates.includes(candidate.candidateId)
      && CandidateReader.listCandidateIds(workingDir).includes(candidate.candidateId)) {
      const directory = DiagnosePaths.candidateDir(workingDir, candidate.candidateId)
      const complete = ['rationale.md', 'diff.md', 'SKILL.md', 'score.md'].every(file => {
        const path = join(directory, file)
        return lstatSync(path, { throwIfNoEntry: false })?.isFile() && readFileSync(path, 'utf8').trim().length > 0
      })
      const saved = complete ? CandidateReader.readCandidateFromDisk(workingDir, candidate.candidateId) : null
      if (saved?.targetSkill === candidate.targetSkill && saved.status === 'PROPOSED') {
        return { candidateCreated: { ...saved, action: candidate.action } }
      }
    }
    return {
      candidateCreated: null,
      optimization: { status: 'failed', reason: 'The optimizer did not return a valid decision for a new, complete candidate.' },
    }
  }

  static readCandidateFromDisk(
    workingDir: string,
    candidateId?: string
  ): CandidateReportInfo | null {
    const candidatesBaseDir = DiagnosePaths.candidatesDir(workingDir)
    if (!existsSync(candidatesBaseDir)) {
      return null
    }

    let targetId = candidateId
    if (!targetId) {
      try {
        const dirs = CandidateReader.listCandidateIds(workingDir)
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

        if (dirs.length === 0) {
          return null
        }
        targetId = dirs[0]
      } catch {
        return null
      }
    }

    const candidateDir = DiagnosePaths.candidateDir(workingDir, targetId)
    if (!isCandidateId(targetId) || !lstatSync(candidateDir, { throwIfNoEntry: false })?.isDirectory()) {
      return null
    }

    let targetSkill = 'unknown'
    let rationaleText: string | undefined
    let proposedChange: string | undefined

    const rationalePath = DiagnosePaths.candidateRationalePath(workingDir, targetId)
    if (existsSync(rationalePath)) {
      try {
        const content = readFileSync(rationalePath, 'utf8')
        
        // Extract Target Skill
        const skillMatch = content.match(/##\s*Target Skill\s*\n+([^\n#]+)/i)
        if (skillMatch && skillMatch[1]) {
          targetSkill = skillMatch[1].trim()
        }

        // Extract Diagnosis / Rationale
        const diagMatch = content.match(/##\s*Diagnosis\s*\n+([\s\S]*?)(?=\n##|$)/i)
        if (diagMatch && diagMatch[1]) {
          rationaleText = diagMatch[1].trim()
        }

        // Extract Proposed Change
        const changeMatch = content.match(/##\s*Proposed Change\s*\n+([\s\S]*?)(?=\n##|$)/i)
        if (changeMatch && changeMatch[1]) {
          proposedChange = changeMatch[1].trim()
        }
      } catch {
        // ignore read error
      }
    }

    return {
      candidateId: targetId,
      targetSkill,
      status: CandidateReader.getCandidateStatus(workingDir, targetId, targetSkill),
      path: `docs/harness-history/candidates/${targetId}`,
      rationale: rationaleText,
      proposedChange,
    }
  }

  static resolveCandidate(
    output?: AgentOutput,
    workingDir?: string
  ): CandidateReportInfo | null {
    if (output) {
      const fromOutput = CandidateReader.extractCandidateFromAgentOutput(output, workingDir)
      if (fromOutput) {
        return fromOutput
      }
    }

    if (workingDir) {
      return CandidateReader.readCandidateFromDisk(workingDir)
    }

    return null
  }
}
