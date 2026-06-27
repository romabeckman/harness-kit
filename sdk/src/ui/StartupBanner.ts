import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export class StartupBanner {
  private static getVersion(): string {
    try {
      // Handle both src/ execution and dist/ execution
      const pkgPath = join(__dirname, '..', '..', 'package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      return pkg.version || '1.0.0'
    } catch {
      return '1.0.0'
    }
  }

  static render(width: number): string {
    const version = this.getVersion()

    // For narrow displays, return a simplified but informative pipeline representation
    if (width < 40) {
      return [
        `+---------------------------------+`,
        `|  [HK Pipeline v${version}]      |`,
        `+---------------------------------+`,
        `| [A] Refinement -> (S-Arch)      |`,
        `| [B] Impl       -> (BE|FE, TDD)  |`,
        `| [C] Valid      -> (Retry 2x)    |`,
        `+---------------------------------+`,
        `| [D] Tuning -> (H-Eval,Pareto)   |`,
        `| [E] Memory -> (Disk Persist)    |`,
        `|    <-- (Next Cycle)             |`,
        `+---------------------------------+`,
      ].join('\n')
    }

    // For wider displays, render a more detailed and structured 
    // ASCII representation of the attached pipeline diagram.
    return [
      `+---------------------------------------------------------+`,
      `|      [ harness-kit Pipeline ] - v${version}            |`,
      `+---------------------------------------------------------+`,
      `| [A] -> [Refinement]      -> (architect, docs)          |`,
      `| [B] -> [Implementation]  -> (dev-be|fe, TDD)           |`,
      `| [C] -> [Dual Valid]      -> (Scores A&B >= threshold)  |`,
      `|     <--- (RETRY: max 2x)                               |`,
      `| [D] -> [Auto-Tuning]     -> (h-eval, pareto)           |`,
      `| [E] -> [Memory]          -> (disk persistence)         |`,
      `|     <--- (Next Cycle / Iteration)                      |`,
      `+---------------------------------------------------------+`,
    ].join('\n')
  }
}
