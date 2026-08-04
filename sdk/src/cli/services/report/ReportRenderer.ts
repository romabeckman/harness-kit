import type { ProductReport } from './types'
import { AnsiHelpers } from '../../../ui/AnsiHelpers'

export class ReportRenderer {
  render(report: ProductReport): void {
    if (report.backlogSummary.total === 0 && report.taskSummary.total === 0 && report.configSnapshot.projectPaths.length === 0) {
      console.log(AnsiHelpers.yellow('\nNo orchestration session data found.'))
      console.log('Run `hrns init` or `hrns run` to start a session.')
    } else {
      this.renderConfig(report.configSnapshot)
      this.renderBacklog(report.backlogSummary)
      this.renderTasks(report.taskSummary)
      this.renderDecisions(report.decisionSummary)
    }
    
    // Always render token report if we have it (or let TokenLedger print it)
    console.log(AnsiHelpers.cyan('\n--- TOKEN REPORT ---'))
    // Since we need to just print it, and the original cmdReport used ledger.printReport(),
    // we can either format it here or rely on the caller to print the ledger.
    // For now, we print a basic summary if the caller delegates it to us.
    console.log(`Input Tokens: ${report.tokenReport.totals.inputTokens}`)
    console.log(`Output Tokens: ${report.tokenReport.totals.outputTokens}`)
    console.log(`Cache Read: ${report.tokenReport.totals.cacheReadTokens}`)
    console.log(`Cost: $${report.tokenReport.totals.costUsd.toFixed(4)}\n`)
  }

  private renderConfig(config: ProductReport['configSnapshot']): void {
    console.log(AnsiHelpers.cyan('\n--- CONFIGURATION ---'))
    console.log(`Paths: ${AnsiHelpers.dim(config.projectPaths.join(', ') || '[]')}`)
    console.log(`Current Phase: ${AnsiHelpers.blue(config.currentPhase)}`)
    console.log(`Score Thresholds: TL ${config.scoreThresholdTL} / Adv ${config.scoreThresholdAdv}`)
    console.log(`Max Reworks: ${config.maxReworks} | Completed Cycles: ${config.completedCycles}`)
  }

  private renderBacklog(backlog: ProductReport['backlogSummary']): void {
    console.log(AnsiHelpers.cyan('\n--- BACKLOG SUMMARY ---'))
    console.log(`Total Features: ${backlog.total}`)
    const { NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED, FAILED } = backlog.byStatus
    console.log(
      `NOT_STARTED: ${AnsiHelpers.dim(NOT_STARTED.toString())} | ` +
      `IN_PROGRESS: ${AnsiHelpers.blue(IN_PROGRESS.toString())} | ` +
      `COMPLETED: ${AnsiHelpers.green(COMPLETED.toString())} | ` +
      `BLOCKED: ${AnsiHelpers.yellow(BLOCKED.toString())} | ` +
      `FAILED: ${AnsiHelpers.red(FAILED.toString())}`
    )
    if (backlog.avgScoreTL !== null || backlog.avgScoreAdv !== null) {
      console.log(`Avg Scores: TL ${backlog.avgScoreTL?.toFixed(2) ?? '-'} / Adv ${backlog.avgScoreAdv?.toFixed(2) ?? '-'}`)
    }
  }

  private renderTasks(tasks: ProductReport['taskSummary']): void {
    console.log(AnsiHelpers.cyan('\n--- TASK PROGRESS ---'))
    console.log(`Total Tasks: ${tasks.total}`)
    for (const f of Object.values(tasks.byFeature)) {
      const percentage = f.totalTasks > 0 ? Math.round((f.completedTasks / f.totalTasks) * 100) : 0
      console.log(`${f.featureId} [${f.status}]: ${percentage}% (${f.completedTasks}/${f.totalTasks}) - ${f.title}`)
      if (f.reworks > 0) {
        console.log(AnsiHelpers.dim(`  Reworks: ${f.reworks}`))
      }
    }
  }

  private renderDecisions(decisions: ProductReport['decisionSummary']): void {
    if (decisions.totalDecisions === 0) return
    console.log(AnsiHelpers.cyan('\n--- RECENT DECISIONS ---'))
    console.log(`Total Decisions Logged: ${decisions.totalDecisions}`)
    for (const d of decisions.recentDecisions) {
      console.log(AnsiHelpers.dim(d))
    }
  }
}
