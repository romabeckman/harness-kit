import { execFileSync } from 'node:child_process'
import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'
import { AnsiHelpers } from '../../ui/AnsiHelpers'

export class DeployHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.DEPLOY) {
      return super.handle(phase, context)
    }

    // --skip-deploy: bypass git operations entirely
    if (context.config.skipDeploy) {
      process.stdout.write(`[DEPLOY] --skip-deploy active — skipping git deployment\n`)
      return Phase.HALTED
    }

    const projectPaths = context.config.projectPaths
    if (!projectPaths || projectPaths.length === 0) {
      process.stdout.write(`[DEPLOY] No project paths configured — skipping deploy\n`)
      return Phase.HALTED
    }

    const results: Array<{ path: string; status: 'ok' | 'error'; message: string }> = []

    for (const projectPath of projectPaths) {
      process.stdout.write(
        `\n${AnsiHelpers.blue('⟶')} ${AnsiHelpers.dim('Deploying:')} ${AnsiHelpers.cyan(projectPath)}\n`
      )

      try {
        // Stage all changes (respects .gitignore)
        this.runGit(projectPath, ['add', '--all'])
        process.stdout.write(`  ${AnsiHelpers.dim('git add --all')} ${AnsiHelpers.green('✔')}\n`)

        // Safety check: verify if any sensitive files/patterns were accidentally staged
        const sensitiveFiles = this.detectStagedSensitiveFiles(projectPath)
        if (sensitiveFiles.length > 0) {
          this.runGit(projectPath, ['reset'])
          throw new Error(
            `Security pre-check blocked commit: sensitive file(s) staged [${sensitiveFiles.join(', ')}]. Please add them to .gitignore.`
          )
        }

        // Check if there is anything to commit
        if (!this.hasUncommittedChanges(projectPath)) {
          process.stdout.write(
            `  ${AnsiHelpers.dim('Nothing to commit — skipping commit/push for')} ${projectPath}\n`
          )
          results.push({ path: projectPath, status: 'ok', message: 'nothing to commit' })
          continue
        }

        // Generate commit message via LLM (same model/phase_key as Memory/Steering)
        const commitMessage = await this.generateCommitMessage(projectPath, context)
        process.stdout.write(
          `  ${AnsiHelpers.dim('commit message:')} ${AnsiHelpers.cyan(commitMessage)}\n`
        )

        // Commit
        this.runGit(projectPath, ['commit', '-m', commitMessage])
        process.stdout.write(`  ${AnsiHelpers.dim('git commit')} ${AnsiHelpers.green('✔')}\n`)

        // Push — no rebase, no conflict resolution; fail fast on errors
        this.runGit(projectPath, ['push'])
        process.stdout.write(`  ${AnsiHelpers.dim('git push')} ${AnsiHelpers.green('✔')}\n`)

        results.push({ path: projectPath, status: 'ok', message: commitMessage })
      } catch (err: any) {
        const message = err?.message ?? String(err)
        process.stderr.write(
          `\n${AnsiHelpers.red('✗')} Deploy failed for ${projectPath}: ${message}\n`
        )
        results.push({ path: projectPath, status: 'error', message })
      }
    }

    const failed = results.filter(r => r.status === 'error')
    const deployed = results.filter(r => r.status === 'ok')
    const commitMessages = results
      .filter(r => r.status === 'ok' && r.message !== 'nothing to commit')
      .map(r => r.message)
      .join(' | ')

    context.fsm.appendDecision({
      featureId: null,
      decision: `Deploy: ${deployed.length}/${projectPaths.length} projects deployed`,
      rationale: failed.length > 0
        ? `Failed paths: ${failed.map(r => r.path).join(', ')}`
        : commitMessages
          ? `Commits: ${commitMessages}`
          : `All paths had nothing to commit.`,
    })

    if (failed.length > 0) {
      process.stderr.write(
        `\n${AnsiHelpers.yellow('⚠')} ${AnsiHelpers.dim(`Deploy completed with ${failed.length} error(s). See above for details.`)}\n`
      )
    }

    return Phase.HALTED
  }

  /**
   * Calls the LLM (same phaseKey as Memory/Phase E) to generate a Conventional
   * Commit message based on the staged diff stat for the given project path.
   * Falls back to a deterministic message if the agent returns nothing usable.
   */
  private async generateCommitMessage(projectPath: string, context: PhaseContext): Promise<string> {
    let diffStat = ''
    try {
      diffStat = execFileSync('git', ['diff', '--staged', '--stat'], {
        cwd: projectPath,
        stdio: 'pipe',
        encoding: 'utf8',
      }).trim()
    } catch {
      // ignore — diffStat stays empty
    }

    const prompt = [
      `## Task`,
      `Produce exactly ONE Conventional Commit message for the staged changes listed below.`,
      `Output ONLY the commit message — no explanation, no bullet points, no markdown fences, no quotes, no trailing punctuation.`,
      ``,
      `## Conventional Commits format`,
      `<type>[(<scope>)]: <description>`,
      ``,
      `Allowed types (choose the best fit):`,
      `  feat     — new feature visible to users or consumers`,
      `  fix      — bug fix`,
      `  refactor — code restructure, no behaviour change`,
      `  perf     — performance improvement`,
      `  test     — adding or fixing tests`,
      `  docs     — documentation only`,
      `  chore    — tooling, config, scripts, deps`,
      `  build    — build system or external dependency changes`,
      `  ci       — CI/CD pipeline changes`,
      `  style    — formatting, whitespace, missing semicolons (no logic change)`,
      ``,
      `Rules:`,
      `  1. MUST use one of the types above.`,
      `  2. scope is OPTIONAL — use it only when a module/domain is obvious (e.g. "auth", "api", "parser").`,
      `  3. description MUST use imperative mood: "add", "fix", "remove" — NOT "added", "fixes", "removes".`,
      `  4. Total length MUST be <= 400 characters.`,
      `  5. No capital first letter in description (lowercase after the colon+space).`,
      `  6. No period at the end.`,
      `  7. BREAKING CHANGE: use a ! after type/scope ONLY if the changes break a public API.`,
      ``,
      `## Correct examples`,
      `  feat(auth): add OAuth2 PKCE flow`,
      `  fix(parser): handle empty array edge case`,
      `  refactor: extract config loader into separate module`,
      `  chore(deps): bump vitest to 3.1.0`,
      `  docs: add DeployHandler usage to README`,
      `  test(orchestrator): cover phase transition to DEPLOY`,
      `  feat!: remove deprecated PhaseDeployHandler`,
      ``,
      `## Staged diff stat`,
      diffStat || '(no diff stat available)',
    ].join('\n')

    try {
      const output = await context.invokeAgent({
        agent: 'harness-kit:developer-backend',
        mode: 'autonomous',
        phaseKey: 'memory',
        prompt,
      })

      const raw = (output.raw ?? '').trim()
      // Take only the first non-empty line — strip any accidental markdown or quotes
      const firstLine = raw
        .split('\n')
        .map((l: string) => l.trim().replace(/^["'`]+|["'`]+$/g, ''))
        .find((l: string) => l.length > 0 && l.length <= 120)

      if (firstLine) return firstLine
    } catch {
      // fall through to fallback
    }

    // Deterministic fallback
    const config = context.fsm.loadBootstrapConfig()
    return `chore: deploy cycle ${config.cycleCounter.completedCycles}`
  }

  private runGit(cwd: string, args: string[]): void {
    execFileSync('git', args, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
    })
  }

  private hasUncommittedChanges(cwd: string): boolean {
    try {
      const output = execFileSync('git', ['status', '--porcelain'], {
        cwd,
        stdio: 'pipe',
        encoding: 'utf8',
      })
      return output.trim().length > 0
    } catch {
      return false
    }
  }

  /**
   * Checks staged files against a list of sensitive patterns (.env, *.pem, *.key, etc.)
   * to prevent accidental credential leakage in automated commits.
   */
  private detectStagedSensitiveFiles(cwd: string): string[] {
    try {
      const output = execFileSync('git', ['diff', '--cached', '--name-only'], {
        cwd,
        stdio: 'pipe',
        encoding: 'utf8',
      })
      const stagedFiles = output.split('\n').map(f => f.trim()).filter(Boolean)

      const sensitivePatterns = [
        /\.env($|\.)/i,
        /\.pem$/i,
        /\.key$/i,
        /id_rsa/i,
        /id_ed25519/i,
        /credentials\.json$/i,
        /service[-_]account.*\.json$/i,
        /secrets?\.(json|yaml|yml)$/i,
      ]

      return stagedFiles.filter(file => sensitivePatterns.some(pattern => pattern.test(file)))
    } catch {
      return []
    }
  }
}
