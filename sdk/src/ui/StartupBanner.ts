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
        `|  [Harness Pipeline v${version}] |`,
        `+---------------------------------+`,
        `| [1] Bootstrap  -> (S-Arch)      |`,
        `| [2] Planning   -> (Docs)        |`,
        `| [3] Develop    -> (BE|FE)       |`,
        `| [4] Review     -> (Retry 2x)    |`,
        `+---------------------------------+`,
        `| [5] StateCheck -> (Status)      |`,
        `| [6] Transition -> (Next Phase)  |`,
        `| [7] Memory     -> (Learnings)   |`,
        `| [8] Deploy     -> (Git)         |`,
        `+---------------------------------+`,
      ].join('\n')
    }

    // For wider displays, render a more detailed and structured 
    // ASCII representation of the attached pipeline diagram.
    return [
      `+---------------------------------------------------------+`,
      `|      [ harness-kit Pipeline ] - v${version}            |`,
      `+---------------------------------------------------------+`,
      `| [1] -> [BOOTSTRAP]       -> (architect, backlog)       |`,
      `| [2] -> [PLANNING]        -> (architect, docs)          |`,
      `| [3] -> [DEVELOPMENT]     -> (dev-be|fe, TDD)           |`,
      `| [4] -> [REVIEW]          -> (Scores >= threshold)      |`,
      `|     <--- (RETRY: max 2x)                               |`,
      `| [5] -> [TRANSITION]      -> (completion / next)        |`,
      `|     <--- (Next Cycle / Iteration)                      |`,
      `| [6] -> [MEMORY]          -> (project learnings)        |`,
      `| [7] -> [DEPLOY]          -> (git push)                 |`,
      `+---------------------------------------------------------+`,
    ].join('\n')
  }
}
