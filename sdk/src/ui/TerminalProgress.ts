import { AnsiHelpers } from './AnsiHelpers'

export class TerminalProgress {
  private static spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  private static spinnerTimer: NodeJS.Timeout | null = null
  private static currentMessage = ''
  private static currentPhase = ''

  /**
   * Writes spinner to stderr so it never collides with subprocess stdout output
   * (e.g. agy / claude writing directly to the terminal TTY).
   */
  static startSpinner(phase: string, message: string) {
    if (this.spinnerTimer) this.stopSpinner()
    this.currentPhase = phase
    this.currentMessage = message
    let frame = 0
    const startTime = Date.now()
    process.stderr.write(AnsiHelpers.hideCursor())
    this.spinnerTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const sp = AnsiHelpers.cyan(this.spinnerFrames[frame])
      const timeStr = AnsiHelpers.dim(`(${elapsed}s)`)
      const text = `\r${AnsiHelpers.clearLine()}${sp} [${AnsiHelpers.blue(this.currentPhase)}] ${this.currentMessage} ${timeStr}`
      process.stderr.write(text)
      frame = (frame + 1) % this.spinnerFrames.length
    }, 80)
  }

  static stopSpinner() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer)
      this.spinnerTimer = null
    }
    process.stderr.write('\r' + AnsiHelpers.clearLine() + AnsiHelpers.showCursor() + '\n')
  }

  static drawProgressBar(phase: string, total: number, current: number, message: string) {
    const width = 20
    const ratio = total > 0 ? Math.min(Math.max(current / total, 0), 1) : 0
    const filled = Math.round(width * ratio)
    const empty = width - filled
    const bar = AnsiHelpers.green('█'.repeat(filled)) + AnsiHelpers.dim('░'.repeat(empty))
    const percent = Math.round(ratio * 100)

    process.stdout.write(`\r${AnsiHelpers.clearLine()}[${AnsiHelpers.blue(phase)}] ${bar} ${percent}% | ${message}\n`)
  }
}
