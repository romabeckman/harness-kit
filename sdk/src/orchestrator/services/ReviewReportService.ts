import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentOutput } from '../../agent-runner/types'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult, type ExtractionOutcome } from '../../json-extraction/types'
import type { ValidationScores } from '../../validation-gate/types'
import { getSpecsDir } from '../utils/PhaseFileUtils'

export class ReviewReportService {
  cleanReviewReports(workingDir: string, domain: string): void {
    const specsDir = getSpecsDir(workingDir, domain)
    for (const file of ['TL.json', 'QA.json']) {
      const p = join(specsDir, file)
      if (existsSync(p)) rmSync(p, { force: true })
    }
  }

  readReviewReports(workingDir: string, domain: string, tlOutput: AgentOutput, advOutput: AgentOutput) {
    const specsDir = getSpecsDir(workingDir, domain)
    const tlData = this.parseAgentOutput(join(specsDir, 'TL.json'), tlOutput, 'review_tl')
    const advData = this.parseAgentOutput(join(specsDir, 'QA.json'), advOutput, 'review_adv')

    const scores: ValidationScores = {
      scoreTL: typeof tlData['score'] === 'number' ? tlData['score'] : (typeof tlData['scoreTL'] === 'number' ? tlData['scoreTL'] : 0),
      scoreAdv: typeof advData['score'] === 'number' ? advData['score'] : (typeof advData['scoreAdv'] === 'number' ? advData['scoreAdv'] : 0),
      hasHighCriticalVuln: advData['hasHighCriticalVuln'] === true,
      isCrashing: advData['isCrashing'] === true || tlData['isCrashing'] === true,
      // TheGrumpyTechLead
      openPoints: Array.isArray(tlData['openPoints']) ? tlData['openPoints'] : [],
      architectureTip: typeof tlData['architectureTip'] === 'string' ? tlData['architectureTip'] : undefined,
      // AdversarialQA
      edgeCasesMissed: Array.isArray(advData['edgeCasesMissed']) ? advData['edgeCasesMissed'] : [],
      vulnerabilities: Array.isArray(advData['vulnerabilities']) ? advData['vulnerabilities'] : []
    }
    const evidence = [tlData, advData].flatMap(data => Array.isArray(data.learning_evidence) ? data.learning_evidence : [])
    const hasReviewerResults = tlOutput.success !== false && advOutput.success !== false
      && (typeof tlData.score === 'number' || typeof tlData.scoreTL === 'number')
      && (typeof advData.score === 'number' || typeof advData.scoreAdv === 'number')
    return { scores, evidence, hasReviewerResults }
  }

  private parseAgentOutput(filePath: string, agentOutput: AgentOutput, logPrefix: string): Record<string, unknown> {
    let extraction: ExtractionOutcome | undefined
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf8')
        extraction = { data: JSON.parse(content) }
      } catch (error) {
        process.stderr.write(`[${logPrefix}] Failed to parse JSON file: ${error instanceof Error ? error.message : String(error)}\n`)
      }
    }

    if (!extraction) {
      extraction = agentOutput.artefacts && Object.keys(agentOutput.artefacts).length > 0
        ? { data: agentOutput.artefacts }
        : JsonExtractionProtocol.extract(agentOutput.raw)
    }

    if (isExtractionResult(extraction)) {
      return extraction.data as Record<string, unknown>
    }
    process.stderr.write(`[${logPrefix}] JSON extraction failed.\nRaw output (first 500 chars): ${agentOutput.raw?.slice(0, 500)}\n`)
    return {}
  }

  buildReworkContent(scores: ValidationScores): string {
    const sections: string[] = []

    if (scores.openPoints?.length) {
      sections.push(`### Action Items (Tech Lead)\n\n${scores.openPoints.map(p => `- [ ] FIX: ${p}`).join('\n')}`)
    }
    if (scores.architectureTip) {
      sections.push(`### Architecture Tip\n\n${scores.architectureTip}`)
    }
    if (scores.vulnerabilities?.length) {
      const list = scores.vulnerabilities.map(v => `- [ ] FIX: [${v.severity ?? 'UNKNOWN'}] ${v.description ?? 'Unspecified'}`).join('\n')
      sections.push(`### Vulnerabilities\n\n${list}`)
    }
    if (scores.edgeCasesMissed?.length) {
      sections.push(`### Edge Cases Missed\n\n${scores.edgeCasesMissed.map(e => `- [ ] FIX: ${e}`).join('\n')}`)
    }

    return sections.length > 0 ? sections.join('\n\n') : `Score TL: ${scores.scoreTL}, Score Adv: ${scores.scoreAdv}`
  }
}
