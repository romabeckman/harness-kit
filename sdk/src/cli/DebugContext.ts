/**
 * Global singleton for debug mode state.
 * When enabled, all layers log detailed diagnostics to stderr.
 */
export class DebugContext {
  private static _enabled = false

  /** Enable debug mode — prints spawn args, prompts, full errors. */
  static enable(): void {
    this._enabled = true
  }

  /** Whether debug mode is currently active. */
  static get enabled(): boolean {
    return this._enabled
  }

  /** Reset to disabled state (used in tests). */
  static reset(): void {
    this._enabled = false
  }
}
