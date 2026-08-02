import { Phase } from '../types'
import { AnsiHelpers } from '../../ui/AnsiHelpers'
import type { Feature } from '../../file-state/types'

export class OrchestratorFormatter {
  static formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  static printPipelineHeader(current: Phase): void {
    const phases = [
      Phase.BOOTSTRAP,
      Phase.REFINEMENT,
      Phase.PLANNING,
      Phase.DEVELOPMENT,
      Phase.REVIEW,
      Phase.TRANSITION,
      Phase.MEMORY,
      Phase.DEPLOY,
    ]
    const shortNames: Record<Phase, string> = {
      [Phase.BOOTSTRAP]: Phase.BOOTSTRAP,
      [Phase.REFINEMENT]: Phase.REFINEMENT,
      [Phase.PLANNING]: Phase.PLANNING,
      [Phase.DEVELOPMENT]: Phase.DEVELOPMENT,
      [Phase.REVIEW]: Phase.REVIEW,
      [Phase.TRANSITION]: Phase.TRANSITION,
      [Phase.MEMORY]: Phase.MEMORY,
      [Phase.DEPLOY]: Phase.DEPLOY,
      [Phase.CASCADE_BLOCKED]: 'BLOCKED',
      [Phase.HALTED]: 'HALTED',
    }

    const currentIndex = phases.indexOf(current)
    const line = phases
      .map((p, idx) => {
        const name = shortNames[p] || p
        if (idx < currentIndex) {
          return AnsiHelpers.green(`✔ ${name}`)
        } else if (idx === currentIndex) {
          return AnsiHelpers.cyan(`● ${name}`)
        } else {
          return AnsiHelpers.dim(`  ${name}`)
        }
      })
      .join(AnsiHelpers.dim(' → '))

    console.log(`\n${AnsiHelpers.blue('──')} ${AnsiHelpers.dim('Pipeline State:')} [${line}] ${AnsiHelpers.blue('──')}\n`)
  }

  static onFeatureTransition(completed: Feature, next: Feature | null, cycle: number): void {
    const width = 100
    const hr = '╠' + '═'.repeat(width - 2) + '╣'
    const top = '╔' + '═'.repeat(width - 2) + '╗'
    const bot = '╚' + '═'.repeat(width - 2) + '╝'

    const padLine = (content: string): string => {
      const cleanContent = content.replace(/\x1b\[[0-9;]*m/g, '')
      const padLen = width - 6 - cleanContent.length
      return `║  ${content}${' '.repeat(Math.max(0, padLen))}  ║`
    }

    const titleStr = next
      ? `✔  FEATURE COMPLETED`
      : `✔  ALL FEATURES COMPLETED`
    const cycleStr = `[ Cycle ${cycle} ]`
    const headerContent = `${AnsiHelpers.green(titleStr)}${' '.repeat(width - 6 - titleStr.length - cycleStr.length)}${AnsiHelpers.blue(cycleStr)}`

    console.log(`\n${AnsiHelpers.blue(top)}`)
    console.log(padLine(headerContent))
    console.log(AnsiHelpers.blue(hr))
    console.log(padLine(`${AnsiHelpers.cyan(completed.id)}  ${completed.title.slice(0, 88)}`))

    const scoreTLStr = completed.scoreTL !== null ? completed.scoreTL.toString() : '-'
    const scoreAdvStr = completed.scoreAdv !== null ? completed.scoreAdv.toString() : '-'

    console.log(
      padLine(
        `${AnsiHelpers.dim('Score TL:')} ${AnsiHelpers.yellow(scoreTLStr)}  │  ` +
        `${AnsiHelpers.dim('Score Adv:')} ${AnsiHelpers.yellow(scoreAdvStr)}  │  ` +
        `${AnsiHelpers.dim('Status:')} ${completed.status === 'COMPLETED' ? AnsiHelpers.green(completed.status) : AnsiHelpers.red(completed.status)}`
      )
    )

    if (next) {
      console.log(AnsiHelpers.blue(hr))
      console.log(padLine(`${AnsiHelpers.blue('⟶')}  ${AnsiHelpers.dim('NEXT FEATURE')}`))
      const priorityVal = next.priority
      const priorityStr = (priorityVal !== undefined && priorityVal !== null && !isNaN(priorityVal))
        ? priorityVal.toString()
        : '-'
      console.log(
        padLine(
          `${AnsiHelpers.cyan(next.id)}  ${next.title.slice(0, 65)}  ` +
          `[${AnsiHelpers.dim('Priority:')} ${AnsiHelpers.yellow(priorityStr)}]`
        )
      )
    } else {
      console.log(AnsiHelpers.blue(hr))
      console.log(padLine(AnsiHelpers.dim('All backlog items processed — pipeline halting.')))
    }
    console.log(`${AnsiHelpers.blue(bot)}\n`)
  }
}
