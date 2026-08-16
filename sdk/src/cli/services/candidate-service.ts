import { CandidateReader } from '../../diagnose/CandidateReader'
import { CandidatePromotionService } from '../../diagnose/CandidatePromotionService'
import { MetaHarnessAgentAdapter } from '../../diagnose/MetaHarnessAgentAdapter'
import { Runner } from '../../agent-runner/types'
import { AnsiHelpers } from '../../ui/AnsiHelpers'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { DiagnosePaths } from '../../diagnose/utils/DiagnosePaths'

import { parseStandardRunnerArgs } from '../utils/runner-args-parser'

export async function cmdCandidate(cwd: string, args: string[]): Promise<void> {
  const subCommand = args[0] ?? 'list'

  if (subCommand === 'list' || subCommand === 'ls') {
    const candidatesBaseDir = DiagnosePaths.candidatesDir(cwd)
    console.log(`\n── Harness Candidates ──────────────────────────────────`)
    console.log(`  Location: docs/harness-history/candidates/`)

    if (!existsSync(candidatesBaseDir)) {
      console.log(`  Total:    0 candidate(s)`)
      console.log(`────────────────────────────────────────────────────────\n`)
      console.log(`${AnsiHelpers.yellow('!')} No candidates found in docs/harness-history/candidates/\n`)
      return
    }

    const entries = readdirSync(candidatesBaseDir, { withFileTypes: true })
    const candidateDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    console.log(`  Total:    ${candidateDirs.length} candidate(s)`)
    console.log(`────────────────────────────────────────────────────────\n`)

    if (candidateDirs.length === 0) {
      console.log(`${AnsiHelpers.yellow('!')} No candidates found in docs/harness-history/candidates/\n`)
      return
    }

    for (const id of candidateDirs) {
      const info = CandidateReader.readCandidateFromDisk(cwd, id)
      const status = info?.status ?? CandidateReader.getCandidateStatus(cwd, id, info?.targetSkill)

      let statusBadge = AnsiHelpers.yellow('PROPOSED')
      if (status === 'PROMOTED') {
        statusBadge = AnsiHelpers.green('PROMOTED')
      } else if (status === 'APPLIED') {
        statusBadge = AnsiHelpers.cyan('APPLIED')
      }

      console.log(`• ${id} [${statusBadge}]`)
      if (info?.targetSkill) console.log(`  Target Skill: ${info.targetSkill}`)
      console.log(`  Path:         docs/harness-history/candidates/${id}`)
      if (info?.rationale) {
        const shortRationale = info.rationale.split('\n')[0].substring(0, 100)
        console.log(`  Rationale:    ${shortRationale}`)
      }
      console.log()
    }

    console.log(`${AnsiHelpers.cyan('💡')} To review and apply with AI runner: hrns candidate review <candidate_id>\n`)
    return
  }

  if (subCommand === 'review' || subCommand === 'apply') {
    const runnerArgs = parseStandardRunnerArgs(args.slice(1))
    const isNonInteractive = runnerArgs.restArgs.includes('--non-interactive') ||
      runnerArgs.restArgs.includes('--auto') ||
      runnerArgs.restArgs.includes('-y')
    const modelArg = runnerArgs.model
    const effortArg = runnerArgs.effort
    const agentArg = runnerArgs.agentType

    const candidateIdArg = runnerArgs.restArgs.find((a) => !a.startsWith('-'))
    let candidateId = candidateIdArg

    if (!candidateId) {
      const latest = CandidateReader.readCandidateFromDisk(cwd)
      if (!latest) {
        console.error(AnsiHelpers.red(`✗ No candidates found in docs/harness-history/candidates/`))
        return
      }
      candidateId = latest.candidateId
    }

    const candidateInfo = CandidateReader.readCandidateFromDisk(cwd, candidateId)
    if (!candidateInfo) {
      console.error(AnsiHelpers.red(`✗ Candidate ${candidateId} not found in docs/harness-history/candidates/${candidateId}`))
      return
    }

    const targetSkill = candidateInfo.targetSkill && candidateInfo.targetSkill !== 'unknown'
      ? candidateInfo.targetSkill
      : 'unknown'

    const runnerType = agentArg ?? Runner.CLAUDE_CLI

    if (isNonInteractive) {
      console.log(`\n${AnsiHelpers.blue('►')} Applying candidate ${candidateId} autonomously using LLM (${runnerType})...\n`)
      const adapter = new MetaHarnessAgentAdapter({ workingDir: cwd })
      const cliSettings = (modelArg || effortArg)
        ? { model: modelArg ?? '', effort: effortArg ?? '' }
        : undefined

      const output = await adapter.invokeCandidatePromotion(candidateId, targetSkill, runnerType, cliSettings)
      if (output.success) {
        console.log(`\n${AnsiHelpers.green('✔')} Candidate ${candidateId} successfully integrated into active skill by ${runnerType}.`)
      } else {
        const err = (output as any).error ?? output.raw
        console.error(`\n${AnsiHelpers.red('✗')} Candidate promotion encountered an error:`, err)
      }
      return
    }

    // Default: Interactive review
    console.log(`\n── Launching AI Runner for Candidate ${candidateId} ─────────────────`)
    console.log(`  Target Skill: ${targetSkill}`)
    console.log(`  Runner:       ${runnerType}`)
    console.log(`────────────────────────────────────────────────────────\n`)

    const runnerCmd = CandidatePromotionService.buildRunnerCommand(runnerType, candidateId, targetSkill, cwd)
    console.log(`Running: ${AnsiHelpers.cyan(runnerCmd)}\n`)

    const launched = CandidatePromotionService.launchInteractive(runnerType, candidateId, targetSkill, cwd)
    if (!launched) {
      console.log(`\nTo run manually, copy and execute:`)
      console.log(`  ${AnsiHelpers.cyan(runnerCmd)}\n`)
    }
    return
  }

  console.log(`Unknown candidate command: ${subCommand}`)
  console.log(`Usage:`)
  console.log(`  hrns candidate list                    # List all candidates`)
  console.log(`  hrns candidate review [id]             # Launch interactive AI runner session`)
  console.log(`  hrns candidate review [id] --auto      # Apply candidate autonomously via LLM`)
}
