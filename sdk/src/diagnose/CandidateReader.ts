import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AgentOutput } from '../agent-runner/types'
import { JsonExtractionProtocol } from '../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../json-extraction/types'
import type { CandidateReportInfo } from './types'
import { DiagnosePaths } from './utils/DiagnosePaths'

export class CandidateReader {
  static getCandidateStatus(
    workingDir: string,
    candidateId: string,
    targetSkill?: string
  ): 'PROMOTED' | 'APPLIED' | 'PROPOSED' {
    const scorePath = DiagnosePaths.candidateScorePath(workingDir, candidateId)
    if (existsSync(scorePath)) {
      try {
        const scoreContent = readFileSync(scorePath, 'utf8')
        if (/promoted:\s*true/i.test(scoreContent) || /status:\s*PROMOTED/i.test(scoreContent)) {
          return 'PROMOTED'
        }
      } catch {
        // ignore
      }
    }

    if (targetSkill && targetSkill !== 'unknown') {
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
    let data: any = (output as any).parsedJson

    if (!data && output.raw) {
      const outcome = JsonExtractionProtocol.extract(output.raw)
      if (isExtractionResult(outcome) && outcome.data) {
        data = outcome.data
      }
    }

    if (data && typeof data === 'object' && (data.candidateId || data.candidate_id)) {
      const candidateId = String(data.candidateId ?? data.candidate_id ?? '')
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
        const entries = readdirSync(candidatesBaseDir, { withFileTypes: true })
        const dirs = entries
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
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
    if (!existsSync(candidateDir)) {
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
