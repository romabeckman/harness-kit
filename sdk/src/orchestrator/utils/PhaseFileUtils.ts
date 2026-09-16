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

export interface TddOutput {
  featureId: string
  status: 'SUCCESS' | 'FAILED'
  metrics: {
    totalTests: number
    passed: number
    failed: number
    coverage: number
  }
  modifiedFiles: string[]
  developerHandoff?: string
  reworksCount: number
}

export interface TddOutputValidation {
  valid: boolean
  reason: string
  output?: TddOutput
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Reads and validates the structural TDD-OUTPUT.json contract. */
export function readTddOutput(tddOutputPath: string): TddOutput {
  if (!existsSync(tddOutputPath)) {
    throw new Error('TDD-OUTPUT.json not found.')
  }

  let data: unknown
  try {
    const raw = readFileSync(tddOutputPath, 'utf-8')
    data = JSON.parse(raw)
  } catch (err: any) {
    throw new Error(`Failed to parse TDD-OUTPUT.json: ${err.message}`)
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid TDD-OUTPUT.json: root must be an object.')
  }

  const candidate = data as Record<string, unknown>
  const metrics = candidate.metrics
  const validMetrics = metrics !== null
    && typeof metrics === 'object'
    && !Array.isArray(metrics)
    && isFiniteNumber((metrics as Record<string, unknown>).totalTests)
    && isFiniteNumber((metrics as Record<string, unknown>).passed)
    && isFiniteNumber((metrics as Record<string, unknown>).failed)
    && isFiniteNumber((metrics as Record<string, unknown>).coverage)

  if (
    typeof candidate.featureId !== 'string'
    || (candidate.status !== 'SUCCESS' && candidate.status !== 'FAILED')
    || !validMetrics
    || !Array.isArray(candidate.modifiedFiles)
    || !candidate.modifiedFiles.every(file => typeof file === 'string')
    || (candidate.developerHandoff !== undefined && typeof candidate.developerHandoff !== 'string')
    || !Number.isInteger(candidate.reworksCount as number)
    || (candidate.reworksCount as number) < 0
  ) {
    throw new Error('Invalid TDD-OUTPUT.json: contract fields are missing or malformed.')
  }

  return candidate as unknown as TddOutput
}

/** Validates the completion contract for a specific feature attempt. */
export function validateTddOutput(tddOutputPath: string, expectedFeatureId: string): TddOutputValidation {
  let output: TddOutput
  try {
    output = readTddOutput(tddOutputPath)
  } catch (err: any) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : String(err),
    }
  }

  if (output.featureId !== expectedFeatureId) {
    return {
      valid: false,
      reason: `TDD-OUTPUT.json featureId '${output.featureId}' does not match '${expectedFeatureId}'.`,
    }
  }

  if (output.status !== 'SUCCESS') {
    return {
      valid: false,
      reason: `TDD-OUTPUT.json status is '${output.status}', expected 'SUCCESS'.`,
    }
  }

  if (output.metrics.failed !== 0) {
    return {
      valid: false,
      reason: `TDD-OUTPUT.json reports ${output.metrics.failed} failed test(s).`,
    }
  }

  if (
    output.metrics.totalTests < 0 ||
    output.metrics.passed < 0 ||
    output.metrics.failed < 0 ||
    output.metrics.passed > output.metrics.totalTests ||
    output.metrics.coverage < 0 ||
    output.metrics.coverage > 1
  ) {
    return {
      valid: false,
      reason: 'TDD-OUTPUT.json metrics are outside the supported range.',
    }
  }

  if (output.developerHandoff !== undefined && output.developerHandoff.length > 500) {
    return {
      valid: false,
      reason: 'TDD-OUTPUT.json developerHandoff exceeds 500 characters.',
    }
  }

  return { valid: true, reason: 'TDD-OUTPUT.json is a valid successful handoff.', output }
}

/** Formats a TDD result for audit logging without exposing parser failures. */
export function summarizeTddOutput(tddOutputPath: string): TddOutputSummary {
  try {
    const output = readTddOutput(tddOutputPath)
    const metrics = output.metrics
    const metricStr = `tests: ${metrics.totalTests} total, ${metrics.passed} passed, ${metrics.failed} failed, coverage: ${metrics.coverage}`
    const files = output.modifiedFiles.length
      ? `modified: ${output.modifiedFiles.slice(0, 5).join(', ')}${output.modifiedFiles.length > 5 ? ` (+${output.modifiedFiles.length - 5} more)` : ''}`
      : 'no modified files listed'

    return {
      status: output.status,
      rationale: `${metricStr}. ${files}. Reworks: ${output.reworksCount}.`,
    }
  } catch (err: any) {
    const rationale = err instanceof Error ? err.message : String(err)
    return {
      status: rationale.includes('not found') ? 'UNKNOWN' : 'PARSE_ERROR',
      rationale,
    }
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

