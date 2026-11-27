import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Feature, Task } from '../../file-state/types'
import type { Reviewontext } from '../phases/AbstractPhaseHandler'
import { getSpecsDir, readCompletedTddOutput, readTddOutput, type TddOutput } from '../utils/PhaseFileUtils'

export class TddOutputService {
  readonly path: string

  constructor(workingDir: string, private readonly feature: Feature) {
    this.path = join(getSpecsDir(workingDir, feature.domain), 'TDD-OUTPUT.json')
  }

  clear(context: Reviewontext): boolean {
    try {
      rmSync(this.path, { force: true })
      return true
    } catch (error) {
      context.fsm.appendDecision({ featureId: this.feature.id, decision: 'Could not remove TDD-OUTPUT.json', rationale: String(error) })
      return false
    }
  }

  readCompleted(): TddOutput {
    return readCompletedTddOutput(this.path, this.feature.id, this.feature.reworks)
  }

  unavailableNotice(): string {
    return existsSync(this.path)
      ? 'TDD-OUTPUT.json could not be read as a valid report for this attempt.'
      : 'TDD-OUTPUT.json was not generated for this attempt.'
  }

  readForAttempt(): TddOutput | undefined {
    try {
      const output = readTddOutput(this.path)
      if (this.matchesAttempt(output)) return output
    } catch {
      // An absent or unreadable report cannot be used as review evidence.
    }
  }

  recordDevelopment(context: Reviewontext, tasks: Task[], sessionId?: string): void {
    let reported: TddOutput
    try {
      reported = readTddOutput(this.path)
    } catch (error) {
      context.fsm.appendDecision({ featureId: this.feature.id, decision: 'Development: TDD output requires review', rationale: String(error) })
      return
    }
    if (reported.featureId === this.feature.id) {
      try {
        this.normalizeFreshReport(reported, context)
      } catch (error) {
        context.fsm.appendDecision({ featureId: this.feature.id, decision: 'Development: could not normalize TDD-OUTPUT.json', rationale: String(error) })
      }
    }
    try {
      this.readCompleted()
    } catch (error) {
      context.fsm.appendDecision({ featureId: this.feature.id, decision: 'Development: TDD output requires review', rationale: String(error) })
    }
    if (this.matchesAttempt(reported)) {
      context.dreaming?.recordDevelopment(this.feature, reported, tasks, context.config.projectPaths, sessionId)
    }
  }

  private matchesAttempt(output: Pick<TddOutput, 'featureId' | 'reworksCount'>): boolean {
    return output.featureId === this.feature.id && output.reworksCount === this.feature.reworks
  }

  private normalizeFreshReport(reported: TddOutput & { status?: unknown }, context: Reviewontext): void {
    const correctReworks = reported.reworksCount !== this.feature.reworks
    // Retain the legacy failure marker only when it is the sole evidence of incomplete execution.
    const removeStatus = reported.status === 'SUCCESS' || (reported.status === 'FAILED' && (
      reported.metrics.failed !== 0 || reported.orientation_use?.some(entry => entry.decision === 'needs_refinement')
    ))
    if (!correctReworks && !removeStatus) return

    const original = JSON.parse(readFileSync(this.path, 'utf8'))
    original.reworksCount = this.feature.reworks
    if (removeStatus) delete original.status
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporaryPath, JSON.stringify(original, null, 2) + '\n', 'utf8')
      renameSync(temporaryPath, this.path)
    } finally {
      rmSync(temporaryPath, { force: true })
    }
    if (correctReworks) {
      context.fsm.appendDecision({
        featureId: this.feature.id,
        decision: 'Development: corrected TDD-OUTPUT.json reworksCount mismatch',
        rationale: `TDD-OUTPUT.json reported ${reported.reworksCount}, expected ${this.feature.reworks}.`,
      })
      reported.reworksCount = this.feature.reworks
    }
    if (removeStatus) delete reported.status
  }
}
