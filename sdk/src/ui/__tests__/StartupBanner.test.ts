import { describe, it, expect } from 'vitest'
import { StartupBanner } from '../StartupBanner'
import { AnsiHelpers } from '../AnsiHelpers'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8'))
const version = pkg.version || '1.0.0'

describe('StartupBanner', () => {
  it('renders complex ASCII art on large viewports', () => {
    const banner = StartupBanner.render(50)
    expect(banner).toContain('harness-kit')
    expect(banner).toContain('/') // part of ASCII art
    expect(banner).toContain(version) // version from package.json
  })

  it('renders simple text fallback on small viewports', () => {
    const banner = StartupBanner.render(30)
    expect(banner).toContain('Harness')
    expect(banner).not.toContain('█')
    expect(banner).toContain(version)
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

  it('returns correct sequence for color helpers including red', () => {
    expect(AnsiHelpers.red('red')).toBe('\x1b[31mred\x1b[0m')
    expect(AnsiHelpers.green('green')).toBe('\x1b[32mgreen\x1b[0m')
    expect(AnsiHelpers.yellow('yellow')).toBe('\x1b[33myellow\x1b[0m')
    expect(AnsiHelpers.blue('blue')).toBe('\x1b[34mblue\x1b[0m')
    expect(AnsiHelpers.cyan('cyan')).toBe('\x1b[36mcyan\x1b[0m')
  })
})
