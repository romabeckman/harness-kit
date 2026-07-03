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

  static getPhaseDescription(phase: Phase): string {
    switch (phase) {
      case Phase.BOOTSTRAP: return 'BOOTSTRAP (Initialization)'
      case Phase.PHASE_A: return 'PHASE_A (Scope Refinement)'
      case Phase.PHASE_B: return 'PHASE_B (TDD Implementation)'
      case Phase.PHASE_C: return 'PHASE_C (Validation & Review)'
      case Phase.PHASE_D: return 'PHASE_D (Completion Check)'
      case Phase.PHASE_E: return 'PHASE_E (Documentation & Memory)'
      case Phase.PHASE_F: return 'PHASE_F (Feature Transition & Decision)'
      case Phase.CASCADE_BLOCKED: return 'CASCADE_BLOCKED (Dependency Blocked)'
      case Phase.HALTED: return 'HALTED (Execution Halted)'
      default: return phase
    }
  }

  static printPipelineHeader(current: Phase): void {
    const phases = [
      Phase.BOOTSTRAP,
      Phase.PHASE_A,
      Phase.PHASE_B,
      Phase.PHASE_C,
      Phase.PHASE_D,
      Phase.PHASE_E,
      Phase.PHASE_F,
    ]
    const shortNames: Record<Phase, string> = {
      [Phase.BOOTSTRAP]: 'BOOT',
      [Phase.PHASE_A]: 'REFINE',
      [Phase.PHASE_B]: 'IMPLEMENT',
      [Phase.PHASE_C]: 'VALIDATE',
      [Phase.PHASE_D]: 'TUNING',
      [Phase.PHASE_E]: 'MEMORY',
      [Phase.PHASE_F]: 'DECIDE',
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
    const width = 60
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
    console.log(padLine(`${AnsiHelpers.cyan(completed.id)}  ${completed.title}`))

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
          `${AnsiHelpers.cyan(next.id)}  ${next.title}  ` +
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
