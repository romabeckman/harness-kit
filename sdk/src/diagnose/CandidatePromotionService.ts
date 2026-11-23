import spawn from 'cross-spawn'
import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { isCandidateId, isSkillName } from './types'
import { DiagnosePaths } from './utils/DiagnosePaths'

interface PairedResult {
  taskSetId: string
  paired: true
  decision: 'improved'
  cases: number
  baselinePasses: number
  candidatePasses: number
  processImproved?: boolean
}

function isImprovement(value: unknown): value is PairedResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<PairedResult>
  const { cases, baselinePasses, candidatePasses } = result
  return result.paired === true && result.decision === 'improved'
    && typeof result.taskSetId === 'string' && !!result.taskSetId.trim()
    && typeof cases === 'number' && Number.isSafeInteger(cases) && cases > 0
    && typeof baselinePasses === 'number' && Number.isSafeInteger(baselinePasses) && baselinePasses >= 0
    && typeof candidatePasses === 'number' && Number.isSafeInteger(candidatePasses) && candidatePasses <= cases
    && (candidatePasses > baselinePasses || (candidatePasses === baselinePasses && result.processImproved === true))
}

function digest(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function readLocalFile(workspace: string, file: string): Buffer {
  if (relative(realpathSync(workspace), realpathSync(file)) !== relative(workspace, file)
    || !lstatSync(file).isFile()) {
    throw new Error(`Expected a project-local file at ${file}`)
  }
  return readFileSync(file)
}

function replaceFile(file: string, content: Buffer | string): void {
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    writeFileSync(temp, content, { flag: 'wx', mode: lstatSync(file).mode & 0o777 })
    renameSync(temp, file)
  } finally {
    rmSync(temp, { force: true })
  }
}

export class CandidatePromotionService {
  private static prepare(workspacePath: string, candidateId: string, targetSkill: string) {
    if (!isCandidateId(candidateId) || !isSkillName(targetSkill) || targetSkill === 'unknown') {
      throw new Error('Candidate promotion requires a valid candidate ID and target skill.')
    }
    const path = DiagnosePaths.candidateEvaluationPath(workspacePath, candidateId)
    if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Paired search and reserved evaluation results are required at ${path}.`)
    }
    const evidence = JSON.parse(readLocalFile(workspacePath, path).toString('utf8'))
    if (evidence?.candidateId !== candidateId || evidence?.targetSkill !== targetSkill
      || !/^[a-f0-9]{64}$/.test(evidence.baselineSha256)
      || !/^[a-f0-9]{64}$/.test(evidence.candidateSha256)
      || !isImprovement(evidence.search) || !isImprovement(evidence.holdout)
      || evidence.search.taskSetId.trim() === evidence.holdout.taskSetId.trim()) {
      throw new Error('Evaluation must identify this candidate and show paired improvement on distinct search and reserved task sets.')
    }

    const candidate = readLocalFile(workspacePath, DiagnosePaths.candidateSkillPath(workspacePath, candidateId))
    const candidateHash = digest(candidate)
    if (candidateHash !== evidence.candidateSha256) {
      throw new Error('Candidate contents changed after evaluation. Evaluate the current version before promotion.')
    }
    const activePath = join(workspacePath, 'skills', targetSkill, 'SKILL.md')
    const currentHash = digest(readLocalFile(workspacePath, activePath))
    if (currentHash !== evidence.baselineSha256 && currentHash !== candidateHash) {
      throw new Error('Active skill differs from the evaluated baseline. Evaluate the current baseline before promotion.')
    }
    const scorePath = DiagnosePaths.candidateScorePath(workspacePath, candidateId)
    const score = readLocalFile(workspacePath, scorePath).toString('utf8')
    return { candidate, candidateHash, currentHash, activePath, scorePath, score, evidence }
  }

  /** Call after the user approves applying this candidate. */
  static promote(workspacePath: string, candidateId: string, targetSkill: string): void {
    const plan = this.prepare(workspacePath, candidateId, targetSkill)
    if (plan.currentHash !== plan.candidateHash) replaceFile(plan.activePath, plan.candidate)
    if (digest(readLocalFile(workspacePath, plan.activePath)) !== plan.candidateHash) {
      throw new Error('The active skill contents could not be verified after promotion.')
    }
    let score = plan.score.trimEnd()
    for (const [key, value] of Object.entries({
      evaluated: 'true',
      promoted: 'true',
      promoted_at: new Date().toISOString(),
    })) {
      const line = new RegExp(`^[ \\t]*${key}:[^\\r\\n]*`, 'm')
      score = line.test(score) ? score.replace(line, `${key}: ${value}`) : `${score}\n${key}: ${value}`
    }
    replaceFile(plan.scorePath, `${score}\n`)
  }

  static buildPrompt(workspacePath: string, candidateId: string, targetSkill: string): string {
    if (!isCandidateId(candidateId) || !isSkillName(targetSkill)) throw new Error('Invalid candidate ID or skill name.')
    const normWs = DiagnosePaths.toForwardSlashes(workspacePath)
    const candidateDir = `${normWs}/docs/harness-history/candidates/${candidateId}`

    return [
      `Perform a read-only review of candidate ${candidateId} for skill "${targetSkill}".`,
      `Candidate files:`,
      `- Diff: ${candidateDir}/diff.md`,
      `- Rationale: ${candidateDir}/rationale.md`,
      `- Candidate SKILL: ${candidateDir}/SKILL.md`,
      `- Score: ${candidateDir}/score.md`,
      `- Evaluation summary, if available: ${DiagnosePaths.toForwardSlashes(DiagnosePaths.candidateEvaluationPath(workspacePath, candidateId))}`,
      `Instructions:`,
      `Summarize the diff and any paired evaluation results. Report missing evidence. Preserve all files. Exit the review when done so the SDK can check eligibility and request human approval.`,
    ].join('\n')
  }

  static getRunnerCliConfig(runnerType: string, prompt: string): { binary: string; args: string[] } {
    switch (runnerType) {
      case 'antigravity-cli':
        return { binary: 'agy', args: ['--prompt', prompt] }
      case 'copilot-cli':
        return { binary: 'copilot', args: ['--prompt', prompt] }
      case 'codex-cli':
        return { binary: 'codex', args: [prompt] }
      case 'cursor-cli':
        return { binary: 'agent', args: [prompt] }
      case 'kiro-cli':
        return { binary: 'kiro-cli', args: ['chat', prompt] }
      case 'claude-cli':
      default:
        return { binary: 'claude', args: [prompt] }
    }
  }

  static buildRunnerCommand(
    runnerType: string,
    candidateId: string,
    targetSkill: string,
    workspacePath: string
  ): string {
    const prompt = this.buildPrompt(workspacePath, candidateId, targetSkill).replace(/\n/g, ' ')
    const escapedPrompt = prompt.replace(/"/g, '\\"')
    const config = this.getRunnerCliConfig(runnerType, `"${escapedPrompt}"`)

    return `${config.binary} ${config.args.join(' ')}`
  }

  static async launchInteractive(
    runnerType: string,
    candidateId: string,
    targetSkill: string,
    workspacePath: string
  ): Promise<boolean> {
    const prompt = this.buildPrompt(workspacePath, candidateId, targetSkill)
    const config = this.getRunnerCliConfig(runnerType, prompt)
    let plan: ReturnType<typeof this.prepare> | undefined
    try {
      plan = this.prepare(workspacePath, candidateId, targetSkill)
    } catch (error) {
      // Unevaluated candidates can still be reviewed. This invocation cannot promote them.
      console.error(error instanceof Error ? error.message : String(error))
    }

    try {
      const result = spawn.sync(config.binary, config.args, {
        cwd: workspacePath,
        stdio: 'inherit',
      })
      if (result.status !== 0) return false
    } catch {
      return false
    }

    if (!plan) return true
    try {
      const diff = readLocalFile(workspacePath, DiagnosePaths.candidateDiffPath(workspacePath, candidateId))
      console.log(stripVTControlCharacters(diff.toString('utf8')))
      for (const [stage, result] of Object.entries({ search: plan.evidence.search, reserved: plan.evidence.holdout })) {
        console.log(`${stage}: ${result.baselinePasses}/${result.cases} baseline, ${result.candidatePasses}/${result.cases} candidate`)
      }
      const { confirm } = await import('@inquirer/prompts')
      if (await confirm({ message: `Promote candidate ${candidateId} to ${targetSkill}?`, default: false })) {
        const current = this.prepare(workspacePath, candidateId, targetSkill)
        if (current.candidateHash !== plan.candidateHash || current.currentHash !== plan.currentHash
          || JSON.stringify(current.evidence) !== JSON.stringify(plan.evidence)) {
          throw new Error('Candidate, baseline, or evidence changed during review. Review it again before promotion.')
        }
        this.promote(workspacePath, candidateId, targetSkill)
        console.log(`Candidate ${candidateId} promoted.`)
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    }
    return true
  }
}
