import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DreamingEpisodeStore } from '../DreamingEpisodeStore'
import { dreamingFingerprint } from '../DreamingAnalysis'
import type { Feature, Task } from '../types'
import type { TddOutput } from '../../orchestrator/utils/PhaseFileUtils'

describe('DreamingEpisodeStore', () => {
  let workingDir: string
  let productDir: string
  let store: DreamingEpisodeStore
  const feature: Feature = {
    id: 'F001', title: 'Recovery', domain: 'recovery', priority: 1, dependencies: [],
    reworks: 0, scoreTL: null, scoreAdv: null, status: 'IN_PROGRESS',
  }
  const task: Task = {
    featureId: feature.id, domain: feature.domain, taskId: 'T01', project: 'sdk',
    description: 'Verify recovery', status: 'IN_PROGRESS', currentPhase: 'IMPLEMENTATION',
  }
  const output: TddOutput = {
    featureId: feature.id, reworksCount: 0, modifiedFiles: ['retry.test.ts'],
    metrics: { passed: 1, totalTests: 1, failed: 0, coverage: 100 },
    orientation_use: [{
      orientation_id: 'persisted-retry', revision: 1, feature: 'feature:recovery', project: 'sdk',
      decision: 'covered', reason: 'Equivalent recovery test exists', test_ref: 'SC-01',
    }],
  }

  beforeEach(() => {
    workingDir = mkdtempSync(join(tmpdir(), 'dreaming-episodes-'))
    productDir = join(workingDir, 'docs', 'product')
    mkdirSync(join(workingDir, 'sdk'))
    store = new DreamingEpisodeStore(workingDir, productDir)
  })

  afterEach(() => rmSync(workingDir, { recursive: true, force: true }))

  it('resumes only an accepted handoff for the same attempt and tasks', () => {
    store.recordDevelopment(feature, output, [task], ['sdk'], 'developer-session')
    const resumed = new DreamingEpisodeStore(workingDir, productDir)
    expect(resumed.canResume(feature, output, [task])).toBe(true)
    expect(resumed.canResume(feature, { ...output, modifiedFiles: [] }, [task])).toBe(false)
    expect(resumed.canResume(feature, output, [{ ...task, status: 'NOT_STARTED' }])).toBe(false)
    expect(resumed.canResume(feature, output, [{ ...task, taskId: 'T02' }])).toBe(false)
  })

  it('keeps retry evidence and terminal review separate when a runner reuses its session', () => {
    const finding = { project: 'sdk', path: 'retry.test.ts', locator: 'retains identity', summary: 'Check across processes' }
    writeFileSync(join(workingDir, 'sdk', finding.path), finding.locator)
    store.recordDevelopment(feature, output, [task], ['sdk'], 'developer-session')
    store.recordReview(feature, output, 'RETRY', ['review-session'], [finding, { ...finding, path: '../outside.ts' }])
    const [original] = store.list()
    expect(original.projects[0].findings).toEqual([expect.objectContaining({ path: finding.path })])
    expect(original.sourceIssues).toEqual([expect.objectContaining({ path: '../outside.ts', reason: expect.any(String) })])
    expect(original.projects[0].orientation_use).toEqual(output.orientation_use)
    expect(original.closed).toBeUndefined()

    const retry = { ...feature, reworks: 1 }
    const retryOutput = { ...output, reworksCount: 1, orientation_use: [] }
    store.recordDevelopment(retry, retryOutput, [task], ['sdk'], 'developer-session')
    store.recordReview(retry, retryOutput, 'PASS', ['review-session'])
    store.closeFeature({ ...retry, status: 'COMPLETED' })
    store.closeFeature({ ...retry, status: 'COMPLETED' })

    const attempts = store.list()
    expect(attempts).toHaveLength(2)
    expect(attempts.find(attempt => attempt.reworks === 0)).toMatchObject({ closed: true, review: 'RETRY' })
    expect(attempts.find(attempt => attempt.reworks === 1)).toMatchObject({
      closed: true, review: 'PASS', previousAttemptId: original.id, sourceSessions: ['developer-session', 'review-session'],
      projects: [{ orientation_use: [] }],
    })
  })

  it('does not attribute a projectless decision across multiple owners', () => {
    store.recordDevelopment(feature, {
      ...output, orientation_use: [{ ...output.orientation_use![0], project: undefined }],
    }, [task, { ...task, taskId: 'T02', project: 'web' }], ['sdk', 'web'])
    expect(store.list()[0].projects.map(project => project.orientation_use)).toEqual([undefined, undefined])
  })

  it('returns a chronological project-scoped chain with development sources and retry findings', () => {
    writeFileSync(join(workingDir, 'sdk', 'retry.test.ts'), 'retains identity')
    store.recordDevelopment(feature, output, [task], ['sdk'], 'developer-session')
    store.recordReview(feature, output, 'RETRY', [], [{ project: 'sdk', path: 'retry.test.ts', locator: 'retains identity', summary: 'identity' }])
    const next = { ...feature, reworks: 1 }
    const nextOutput = { ...output, reworksCount: 1 }
    store.recordDevelopment(next, nextOutput, [task], ['sdk'], 'developer-session')
    const terminal = store.recordReview(next, nextOutput, 'PASS')!
    const chain = store.learningChain(terminal, join(workingDir, 'sdk'))
    expect(chain.error).toBeUndefined()
    expect(chain.attempts.map(attempt => attempt.reworks)).toEqual([0, 1])
    expect(chain.attempts[0].projects[0]).toMatchObject({ sources: ['retry.test.ts'], findings: [expect.objectContaining({ locator: 'retains identity' })] })
  })

  it('preserves developer test evidence without requiring reviewer classification', () => {
    writeFileSync(join(workingDir, 'sdk', 'retry.test.ts'), 'retains identity')
    store.recordDevelopment(feature, { ...output, learning_evidence: [{ project: 'sdk', path: 'retry.test.ts', locator: 'retains identity', summary: 'Same instance used.' }] }, [task], ['sdk'], 'dev')
    expect(store.list()[0].projects[0].findings).toEqual([expect.objectContaining({ locator: 'retains identity' })])
  })

  it('reports broken and cyclic attempt links without crossing features', () => {
    store.recordDevelopment(feature, output, [task], ['sdk'])
    const episode = store.list()[0]
    const path = join(productDir, 'project-dreaming', 'episodes', `${episode.id}.json`)
    const disk = JSON.parse(readFileSync(path, 'utf8'))
    disk.previousAttemptId = episode.id
    writeFileSync(path, JSON.stringify(disk))
    expect(store.learningChain(disk, join(workingDir, 'sdk')).error).toContain('Cycle')
    disk.previousAttemptId = 'missing'
    writeFileSync(path, JSON.stringify(disk))
    expect(store.learningChain(disk, join(workingDir, 'sdk')).error).toContain('Missing')
  })

  it('records ambiguous homonymous paths instead of assigning them to either project', () => {
    mkdirSync(join(workingDir, 'web'))
    writeFileSync(join(workingDir, 'sdk', 'retry.test.ts'), 'server')
    writeFileSync(join(workingDir, 'web', 'retry.test.ts'), 'web')
    store.recordDevelopment(feature, output, [task, { ...task, taskId: 'T02', project: 'web' }], ['sdk', 'web'])
    const episode = store.list()[0]
    expect(episode.sourceIssues).toContainEqual({ path: 'retry.test.ts', reason: 'ambiguous project ownership' })
    expect(episode.projects.every(project => !project.sources?.length)).toBe(true)
  })

  it('reopens only the project whose saved source changes', () => {
    mkdirSync(join(workingDir, 'web'))
    writeFileSync(join(workingDir, 'sdk', 'retry.test.ts'), 'server')
    writeFileSync(join(workingDir, 'web', 'view.test.ts'), 'web')
    store.recordDevelopment(feature, { ...output, modifiedFiles: ['retry.test.ts', 'view.test.ts'] }, [task, { ...task, taskId: 'T02', project: 'web' }], ['sdk', 'web'])
    const episode = store.list()[0]
    const sdk = store.learningChain(episode, join(workingDir, 'sdk')).attempts
    const web = store.learningChain(episode, join(workingDir, 'web')).attempts
    const beforeSdk = dreamingFingerprint(sdk)
    const beforeWeb = dreamingFingerprint(web)
    writeFileSync(join(workingDir, 'sdk', 'retry.test.ts'), 'changed server')
    expect(dreamingFingerprint(sdk)).not.toBe(beforeSdk)
    expect(dreamingFingerprint(web)).toBe(beforeWeb)
  })
})
