import { execFileSync } from 'node:child_process'
import { Phase } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'
import { AnsiHelpers } from '../../ui/AnsiHelpers'

export class DeployHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
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
  private async generateCommitMessage(projectPath: string, context: Reviewontext): Promise<string> {
    let diffOutput = ''
    try {
      diffOutput = execFileSync('git', ['diff', '--staged'], {
        cwd: projectPath,
        stdio: 'pipe',
        encoding: 'utf8',
      }).trim()

      if (diffOutput.length > 8000) {
        diffOutput = diffOutput.slice(0, 8000) + '\n... (diff truncated)'
      }
    } catch {
      // ignore — diffOutput stays empty
    }

    const prompt = [
      `## Task`,
      `Produce exactly ONE Conventional Commit message for the staged changes listed below.`,
      `The commit message MUST include a brief subject line, a blank line, and a body with bullet points detailing the changes.`,
      `Output ONLY the commit message — no explanation, no markdown fences, no quotes.`,
      ``,
      `## Conventional Commits format`,
      `<type>[(<scope>)]: <description>`,
      ``,
      `<body>`,
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
      `  4. The body MUST use bullet points (-) for each significant change. Keep it to a maximum of 5 bullet points.`,
      `  5. Each bullet point MUST NOT exceed 100 characters.`,
      `  6. The entire subject line (type + scope + description) MUST NOT exceed 72 characters.`,
      `  7. No capital first letter in description (lowercase after the colon+space) for the subject line.`,
      `  8. No period at the end of the subject line.`,
      `  9. BREAKING CHANGE: use a ! after type/scope ONLY if the changes break a public API.`,
      ``,
      `## Correct example`,
      `refactor: update phase handlers to use Reviewontext and rename payload types`,
      ``,
      `- Changed PhaseContext to Reviewontext in DevelopmentHandler and others.`,
      `- Renamed payload types to PlanningPayload, DevelopmenPayload, ReviewPayload, and MemoryPayload.`,
      `- Updated method calls in ContextAssembler and PhaseDecisionLogger to reflect new naming conventions.`,
      `- Adjusted tests to accommodate changes in context and payload types.`,
      ``,
      `## Staged diff`,
      diffOutput || '(no diff available)',
    ].join('\n')

    try {
      const output = await context.invokeAgent({
        agent: 'harness-kit:developer-devops',
        mode: 'autonomous',
        phaseKey: 'memory',
        prompt,
      })

      const raw = (output.raw ?? '').trim()
      // Clean up markdown fences if present
      const cleanMessage = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()

      if (cleanMessage) return cleanMessage
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
        /\.pfx$/i,
        /\.p12$/i,
        /\.crt$/i,
        /\.cer$/i,
        /\.kdbx$/i,
        /id_(rsa|dsa|ecdsa|ed25519)/i,
        /credentials(\.json)?$/i,
        /service[-_]account.*\.json$/i,
        /secrets?\.(json|yaml|yml)$/i,
        /\.aws\/credentials/i,
      ]

      return stagedFiles.filter(file => sensitivePatterns.some(pattern => pattern.test(file)))
    } catch {
      return []
    }
  }
}
