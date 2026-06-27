import { describe, it, expect } from 'vitest'
import { StartupBanner } from '../StartupBanner'
import { AnsiHelpers } from '../AnsiHelpers'

describe('StartupBanner', () => {
  it('renders complex ASCII art on large viewports', () => {
    const banner = StartupBanner.render(50)
    expect(banner).toContain('harness-kit')
    expect(banner).toContain('/') // part of ASCII art
    expect(banner).toContain('v1.0.0') // version from package.json
  })

  it('renders simple text fallback on small viewports', () => {
    const banner = StartupBanner.render(30)
    expect(banner).toContain('Harness')
    expect(banner).not.toContain('█')
    expect(banner).toContain('v1.0.0')
  })
})

describe('AnsiHelpers', () => {
  it('returns correct sequence for moveCursor', () => {
    expect(AnsiHelpers.moveCursor(5, 10)).toBe('\x1b[10;5H')
  })

  it('returns correct sequence for clearLine', () => {
    expect(AnsiHelpers.clearLine()).toBe('\x1b[2K')
  })

  it('returns correct sequence for hideCursor', () => {
    expect(AnsiHelpers.hideCursor()).toBe('\x1b[?25l')
  })

  it('returns correct sequence for showCursor', () => {
    expect(AnsiHelpers.showCursor()).toBe('\x1b[?25h')
  })
})
