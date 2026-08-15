import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { DomainSpecs } from '../../context-assembler/types'

/**
 * File-system utilities shared across phase decision loggers and other
 * orchestrator services. Pure functions — no side effects other than reads.
 */

/** Lists .md spec files in a specs directory, excluding REWORK files. */
export function listSpecFiles(specsDir: string): string[] {
  if (!existsSync(specsDir)) return []
  try {
    return readdirSync(specsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('REWORK'))
      .sort()
  } catch {
    return []
  }
}

export function loadDomainSpecsContent(specsDir: string): DomainSpecs {
  const specs: DomainSpecs = {};
  if (!existsSync(specsDir)) return specs;
  
  try {
    const files = readdirSync(specsDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const fullPath = join(specsDir, f);
      const content = readFileSync(fullPath, 'utf-8');
      if (f.startsWith('001-')) {
        specs.problemSpace = content;
      } else if (f.startsWith('002-')) {
        specs.contextMap = content;
      } else if (f.startsWith('003-') && f.includes('-tactical-design')) {
        const prefix = `<!-- File: ${f} -->\n`;
        specs.tacticalDesign = (specs.tacticalDesign ? specs.tacticalDesign + '\n\n' : '') + prefix + content;
      } else if (f.startsWith('004-') && f.includes('-test-scenarios')) {
        const prefix = `<!-- File: ${f} -->\n`;
        specs.testScenarios = (specs.testScenarios ? specs.testScenarios + '\n\n' : '') + prefix + content;
      }
    }
  } catch {
    // Ignore errors
  }
  return specs;
}

/** Lists .md files under a docs/feature directory, returning full paths (forward-slash). */
export function listDocFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => join(dir, f).replace(/\\/g, '/'))
  } catch {
    return []
  }
}

export interface TddOutputSummary {
  status: string
  rationale: string
}

/** Reads and summarises TDD-OUTPUT.json, returning a safe default when absent or invalid. */
export function readTddOutput(tddOutputPath: string): TddOutputSummary {
  if (!existsSync(tddOutputPath)) {
    return { status: 'UNKNOWN', rationale: 'TDD-OUTPUT.json not found.' }
  }

  try {
    const raw = readFileSync(tddOutputPath, 'utf-8')
    const data = JSON.parse(raw) as {
      status?: string
      metrics?: { totalTests?: number; passed?: number; failed?: number; coverage?: number }
      modifiedFiles?: string[]
      reworksCount?: number
    }

    const metrics = data.metrics
    const metricStr = metrics
      ? `tests: ${metrics.totalTests ?? '?'} total, ${metrics.passed ?? '?'} passed, ${metrics.failed ?? '?'} failed, coverage: ${metrics.coverage ?? '?'}`
      : 'no metrics'

    const files = data.modifiedFiles?.length
      ? `modified: ${data.modifiedFiles.slice(0, 5).join(', ')}${data.modifiedFiles.length > 5 ? ` (+${data.modifiedFiles.length - 5} more)` : ''}`
      : 'no modified files listed'

    return {
      status: data.status ?? 'UNKNOWN',
      rationale: `${metricStr}. ${files}. Reworks: ${data.reworksCount ?? 0}.`,
    }
  } catch (err: any) {
    return { status: 'PARSE_ERROR', rationale: `Failed to parse TDD-OUTPUT.json: ${err.message}` }
  }
}

/** Resolves the product directory from orchestrator context or config. */
export function getProductDir(context: { config?: { productDir?: string }; workingDir?: string }): string {
  return context.config?.productDir ?? join(context.workingDir ?? process.cwd(), 'docs', 'product')
}

/** Resolves the domain specs directory under a working directory. */
export function getSpecsDir(workingDir: string, domain: string): string {
  return join(workingDir, 'docs', 'specs', domain)
}

