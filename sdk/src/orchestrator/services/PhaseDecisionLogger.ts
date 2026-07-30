import { join } from 'node:path'
import type { IFileStateManager } from '../../file-state/FileStateManager'
import type { Feature } from '../../file-state/types'
import { listSpecFiles, listDocFiles, readTddOutput } from '../utils/PhaseFileUtils'

/**
 * Centralized service for writing phase-level audit entries to DECISIONS.md.
 *
 * Each static method corresponds to one orchestrator phase and records a rich,
 * human-readable summary of what happened — feature counts, spec files, TDD
 * metrics, documents written, etc.
 *
 * File-system helpers are delegated to {@link PhaseFileUtils}.
 */
export class PhaseDecisionLogger {

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  static logBootstrap(fsm: IFileStateManager, features: Feature[]): void {
    if (features.length === 0) return

    const byLayer = features.reduce<Record<string, number>>((acc, f) => {
      const key = f.layer ?? 'unknown'
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})

    const layerSummary = Object.entries(byLayer)
      .map(([layer, count]) => `${count} ${layer}`)
      .join(', ')

    fsm.appendDecision({
      featureId: null,
      decision: `Bootstrap: ${features.length} feature(s) created`,
      rationale: `Breakdown by agent — ${layerSummary}. IDs: ${features.map(f => f.id).join(', ')}.`,
    })
  }

  // ─── Phase A ──────────────────────────────────────────────────────────────

  static logPlanning(
    fsm: IFileStateManager,
    feature: Feature,
    specsDir: string,
    taskCount: number
  ): void {
    const specFiles = listSpecFiles(specsDir)
    const fileList = specFiles.length > 0 ? specFiles.join(', ') : 'none'

    fsm.appendDecision({
      featureId: feature.id,
      decision: `Planning: specs generated for domain '${feature.domain}' (${taskCount} task(s))`,
      rationale: `Spec files: ${fileList}.`,
    })
  }

  // ─── Phase B ──────────────────────────────────────────────────────────────

  static logDevelopmen(
    fsm: IFileStateManager,
    feature: Feature,
    tddOutputPath: string
  ): void {
    const summary = readTddOutput(tddOutputPath)

    fsm.appendDecision({
      featureId: feature.id,
      decision: `Development: TDD execution for domain '${feature.domain}' — ${summary.status}`,
      rationale: summary.rationale,
    })
  }

  // ─── Phase C ──────────────────────────────────────────────────────────────

  static logReview(
    fsm: IFileStateManager,
    feature: Feature,
    verdict: string,
    scoreTL: number,
    scoreAdv: number,
    reason: string
  ): void {
    fsm.appendDecision({
      featureId: feature.id,
      decision: `Review: validation verdict ${verdict} for domain '${feature.domain}'`,
      scores: { tl: scoreTL, adv: scoreAdv },
      rationale: reason,
    })
  }

  // ─── Phase E ──────────────────────────────────────────────────────────────

  static logMemory(
    fsm: IFileStateManager,
    projectPaths: string[]
  ): void {
    const docPaths = projectPaths.flatMap(p => listDocFiles(join(p, 'docs', 'feature')))

    const docList = docPaths.length > 0
      ? docPaths.join(', ')
      : 'no new files detected'

    fsm.appendDecision({
      featureId: null,
      decision: `Memory: project memory written`,
      rationale: `Documents created or updated: ${docList}.`,
    })
  }
}
