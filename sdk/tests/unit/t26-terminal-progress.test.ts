import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TerminalProgress } from '../../src/ui/TerminalProgress'

describe('T26 — TerminalProgress', () => {
  let stderrSpy: any
  let stdoutSpy: any

  beforeEach(() => {
    vi.useFakeTimers()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    TerminalProgress.stopSpinner()
    stderrSpy.mockRestore()
    stdoutSpy.mockRestore()
    vi.useRealTimers()
  })

  it('TC-TP-01: startSpinner starts interval and writes hide cursor and frames', () => {
    // Arrange & Act
    TerminalProgress.startSpinner('BOOTSTRAP', 'Scaffolding project')

    // Assert: should hide cursor immediately
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('\x1b[?25l')) // hide cursor sequence

    // Advance timer to trigger spinner interval
    vi.advanceTimersByTime(80)

    // Stderr should contain phase, message, elapsed time
    const output = stderrSpy.mock.calls.map((c: any[]) => String(c[0])).join('')
    expect(output).toContain('BOOTSTRAP')
    expect(output).toContain('Scaffolding project')
    expect(output).toContain('(0s)')
  })

  it('TC-TP-02: startSpinner cleans up previous timer if called again', () => {
    // Arrange & Act
    TerminalProgress.startSpinner('PLANNING', 'msg A')
    const stopSpy = vi.spyOn(TerminalProgress, 'stopSpinner')
    TerminalProgress.startSpinner('DEVELOPMENT', 'msg B')

    // Assert
    expect(stopSpy).toHaveBeenCalled()
    stopSpy.mockRestore()
  })

  it('TC-TP-03: stopSpinner stops interval, clears line and shows cursor', () => {
    // Arrange
    TerminalProgress.startSpinner('REVIEW', 'validating')
    stderrSpy.mockClear()

    // Act
    TerminalProgress.stopSpinner()

    // Assert: should show cursor and newline
    const output = stderrSpy.mock.calls.map((c: any[]) => String(c[0])).join('')
    expect(output).toContain('\x1b[?25h') // show cursor
  })

  it('TC-TP-04: drawProgressBar draws progress bar to stdout', () => {
    // Arrange & Act
    TerminalProgress.drawProgressBar('DEVELOPMENT', 10, 5, 'Progress description')

    // Assert
    const output = stdoutSpy.mock.calls.map((c: any[]) => String(c[0])).join('')
    expect(output).toContain('DEVELOPMENT')
    expect(output).toContain('50%')
    expect(output).toContain('Progress description')
  })

  it('TC-TP-05: drawProgressBar clamps ratio when total is 0 or less', () => {
    // Arrange & Act
    TerminalProgress.drawProgressBar('DEVELOPMENT', 0, 5, 'Zero total')

    // Assert
    const output = stdoutSpy.mock.calls.map((c: any[]) => String(c[0])).join('')
    expect(output).toContain('0%')
  })
})
