import spawn from 'cross-spawn'
import { DiagnosePaths } from './utils/DiagnosePaths'

export class CandidatePromotionService {
  static buildPrompt(workspacePath: string, candidateId: string, targetSkill: string): string {
    const normWs = DiagnosePaths.toForwardSlashes(workspacePath)
    const candidateDir = `${normWs}/docs/harness-history/candidates/${candidateId}`

    return [
      `You are optimizing Harness Kit skills. Apply and integrate candidate ${candidateId} for skill "${targetSkill}".`,
      `Candidate files:`,
      `- Diff: ${candidateDir}/diff.md`,
      `- Rationale: ${candidateDir}/rationale.md`,
      `- Candidate SKILL: ${candidateDir}/SKILL.md`,
      `Instructions:`,
      `1. Review the candidate diff and rationale.`,
      `2. Locate the active target skill (e.g. skills/${targetSkill}/SKILL.md or plugin directory) and apply the improvements.`,
      `3. In ${candidateDir}/score.md, set promoted: true.`,
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

  static launchInteractive(
    runnerType: string,
    candidateId: string,
    targetSkill: string,
    workspacePath: string
  ): boolean {
    const prompt = this.buildPrompt(workspacePath, candidateId, targetSkill)
    const config = this.getRunnerCliConfig(runnerType, prompt)

    try {
      const result = spawn.sync(config.binary, config.args, {
        cwd: workspacePath,
        stdio: 'inherit',
      })
      return result.status === 0
    } catch {
      return false
    }
  }
}
