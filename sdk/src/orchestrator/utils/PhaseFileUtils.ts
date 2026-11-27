import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { DomainSpecs } from '../../context-assembler/types'
import type { IFileStateManager } from '../../file-state/FileStateManager'

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
  metrics: {
    totalTests: number
    passed: number
    failed: number
    coverage: number
  }
  modifiedFiles: string[]
  developerHandoff?: string
  reworksCount: number
  orientation_use?: OrientationUse[]
  learning_evidence?: { project?: string; path: string; locator: string; summary: string; scenario_id?: string }[]
}

const orientationDecisions = ['applied', 'covered', 'skipped', 'needs_refinement'] as const

export interface OrientationUse {
  orientation_id: string
  revision: number
  feature: string
  decision: typeof orientationDecisions[number]
  reason: string
  test_ref?: string
  project?: string
}

function isOrientationUse(value: unknown): value is OrientationUse {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<OrientationUse>
  return typeof entry.orientation_id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.orientation_id)
    && typeof entry.revision === 'number' && Number.isInteger(entry.revision) && entry.revision > 0
    && typeof entry.feature === 'string' && /^feature:\S+$/.test(entry.feature)
    && orientationDecisions.some(decision => decision === entry.decision)
    && typeof entry.reason === 'string' && entry.reason.trim().length > 0
    && (entry.test_ref === undefined || typeof entry.test_ref === 'string')
    && (entry.project === undefined || typeof entry.project === 'string')
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
    || (candidate.status !== undefined && candidate.status !== 'SUCCESS' && candidate.status !== 'FAILED')
    || !validMetrics
    || !Array.isArray(candidate.modifiedFiles)
    || !candidate.modifiedFiles.every(file => typeof file === 'string')
    || (candidate.developerHandoff !== undefined && typeof candidate.developerHandoff !== 'string')
    || !Number.isInteger(candidate.reworksCount as number)
    || (candidate.reworksCount as number) < 0
  ) {
    throw new Error('Invalid TDD-OUTPUT.json: contract fields are missing or malformed.')
  }

  const { orientation_use: orientationUse, ...output } = candidate
  if (orientationUse !== undefined) {
    if (Array.isArray(orientationUse)) {
      if (!orientationUse.every(isOrientationUse)) console.warn('[TDD-OUTPUT] Invalid optional orientation_use entries ignored.')
      output.orientation_use = orientationUse.filter(isOrientationUse).map(({ orientation_id, revision, feature, decision, reason, test_ref, project }) => ({
        orientation_id, revision, feature, decision, reason, test_ref, project,
      }))
    } else {
      console.warn('[TDD-OUTPUT] Invalid optional orientation_use ignored.')
    }
  }
  return output as unknown as TddOutput
}

export function readCompletedTddOutput(path: string, featureId: string, reworks: number): TddOutput {
  const output = readTddOutput(path)
  if (output.featureId !== featureId || output.reworksCount !== reworks) {
    throw new Error('TDD-OUTPUT.json does not match the active feature and rework attempt.')
  }
  const refinement = output.orientation_use?.find(item => item.decision === 'needs_refinement')
  if (refinement) {
    throw new Error(`TDD-OUTPUT.json requires refinement for ${refinement.test_ref || refinement.orientation_id}: ${refinement.reason}`)
  }
  // Legacy failed reports may be incomplete even when the tests they ran passed.
  if ('status' in output && output.status === 'FAILED') {
    throw new Error('The legacy TDD report indicates that execution was incomplete.')
  }
  if (output.metrics.failed !== 0) {
    throw new Error('TDD-OUTPUT.json must report zero failed tests for task completion.')
  }
  const { passed, totalTests } = output.metrics
  if (!Number.isInteger(totalTests) || totalTests < 0 || passed !== totalTests ||
      (output.developerHandoff?.length ?? 0) > 500) {
    throw new Error('TDD-OUTPUT.json has inconsistent test counts or an oversized developer handoff.')
  }
  return output
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
      status: ('status' in output && output.status === 'FAILED') || metrics.failed !== 0 ? 'FAILED' : 'REPORTED',
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

export interface PlanningSource {
  content: string
  exists: boolean
  fileName: 'SCOPE.md' | 'REFINEMENT.md'
  isRefinement: boolean
  label: 'Scope' | 'Refinement'
  path: string
}

/** Resolves the only business context document that a phase may consume. */
export function getPlanningSource(context: {
  config?: { productDir?: string }
  workingDir?: string
  fsm: Pick<IFileStateManager, 'existRefinement' | 'loadRefinement' | 'existScope' | 'loadScope'>
}): PlanningSource {
  const isRefinement = context.fsm.existRefinement()
  const exists = isRefinement || context.fsm.existScope()
  const fileName = isRefinement ? 'REFINEMENT.md' : 'SCOPE.md'

  return {
    content: isRefinement
      ? context.fsm.loadRefinement()
      : exists
        ? context.fsm.loadScope()
        : '',
    exists,
    fileName,
    isRefinement,
    label: isRefinement ? 'Refinement' : 'Scope',
    path: join(getProductDir(context), fileName),
  }
}

/** Resolves the domain specs directory under a working directory. */
export function getSpecsDir(workingDir: string, domain: string): string {
  return join(workingDir, 'docs', 'specs', domain)
}
