# sdk_terminal_ui — Terminal UI Utilities

## OVERVIEW

The `sdk_terminal_ui` module provides ANSI-based terminal rendering utilities for the CLI orchestrator. It renders the startup welcome banner, animated spinners during agent execution, and progress bars for feature completion tracking.

---

## FOLDER STRUCTURE

<folder_structure>
sdk/src/ui/
├── StartupBanner.ts      # ASCII welcome banner rendered at CLI startup
├── AnsiHelpers.ts        # Low-level ANSI escape sequences and color wrappers
└── TerminalProgress.ts   # Animated spinner and progress bar (static class)
</folder_structure>

---

## COMPONENTS

### StartupBanner

Renders the ASCII pipeline overview box at CLI startup. Displays the full phase pipeline and version.

```typescript
// CORRECT: render at startup with terminal column count
StartupBanner.render(process.stdout.columns || 80)
```

### AnsiHelpers

Static helpers for ANSI escape codes. Use these instead of raw escape literals.

| Method | Output | Notes |
|---|---|---|
| `AnsiHelpers.blue(text)` | `\x1b[34m…\x1b[0m` | Phase labels and icons |
| `AnsiHelpers.cyan(text)` | `\x1b[36m…\x1b[0m` | Phase descriptions |
| `AnsiHelpers.green(text)` | `\x1b[32m…\x1b[0m` | Success confirmations, filled progress bar |
| `AnsiHelpers.dim(text)` | `\x1b[2m…\x1b[0m` | Labels and secondary info |
| `AnsiHelpers.yellow(text)` | `\x1b[33m…\x1b[0m` | Warnings |
| `AnsiHelpers.magenta(text)` | `\x1b[35m…\x1b[0m` | Debug highlights |
| `AnsiHelpers.hideCursor()` | `\x1b[?25l` | Call before spinner starts |
| `AnsiHelpers.showCursor()` | `\x1b[?25h` | Call after spinner stops |
| `AnsiHelpers.clearLine()` | `\x1b[2K` | Overwrite current line |
| `AnsiHelpers.moveCursor(x, y)` | `\x1b[y;xH` | Absolute cursor positioning |

### TerminalProgress

Static class. Manages the spinner lifecycle and can render a one-shot progress bar.

| Method | Description |
|---|---|
| `TerminalProgress.startSpinner(phase, message)` | Starts animated braille spinner with phase label. Hides cursor. |
| `TerminalProgress.stopSpinner()` | Clears the spinner line, restores cursor, and emits a newline. |
| `TerminalProgress.drawProgressBar(phase, total, current, message)` | Renders a `[██░░] N%` bar to stdout (one-shot, not animated). |

REQUIRED: Always call `stopSpinner()` in a `finally` block — the orchestrator does this inside `invokeAgentInternal`. Do not call `startSpinner()` without a corresponding `stopSpinner()`.

FORBIDDEN: Do not call `startSpinner()` again without calling `stopSpinner()` first — concurrent spinners share the same static timer reference and will cancel each other.

---

## INTEGRATION POINTS

| Consumer | Integration |
|---|---|
| `HarnessOrchestrator.invokeAgentInternal` | Calls `startSpinner` before agent run and `stopSpinner` in `finally`. |
| `HarnessOrchestrator.run` (transition log) | Uses `AnsiHelpers.blue/cyan/dim` to colorize `⟳ State Transition:` log line. |
| `run.ts` (CLI resume) | Uses `AnsiHelpers.blue/cyan/dim` to display `► Current State:` and `Active Feature:` at resume. |
| `run.ts` (steering apply) | Uses `AnsiHelpers.green` to confirm `✓ Applying N steering action(s)...` |

---

## BEST PRACTICES

REQUIRED: Import `AnsiHelpers` statically — do not use `require()` inline inside hot paths.
REQUIRED: Check `process.stdout.columns` before rendering width-dependent components; fall back to `80`.
FORBIDDEN: Do not write raw ANSI escape strings outside of `AnsiHelpers` — centralize all escape codes in that module.

---

## REFERENCES

- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Folder structure and module responsibilities.
- [**sdk_core.md**](./sdk_core.md): Orchestrator integration points where `TerminalProgress` is called.
- [**sdk_steering.md**](./sdk_steering.md): Steering output confirmation uses `AnsiHelpers.green`.
