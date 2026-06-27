export class AnsiHelpers {
  static moveCursor(x: number, y: number): string {
    return `\x1b[${y};${x}H`
  }

  static clearLine(): string {
    return '\x1b[2K'
  }

  static hideCursor(): string {
    return '\x1b[?25l'
  }

  static showCursor(): string {
    return '\x1b[?25h'
  }
}
