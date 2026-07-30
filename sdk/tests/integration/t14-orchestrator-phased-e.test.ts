import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { HarnessOrchestrator } from '../../src/orchestrator/HarnessOrchestrator'
import { FakeAgentRunner } from '../helpers/FakeAgentRunner'
import { FileStateManager } from '../../src/file-state/FileStateManager'
import { Complexity } from '../../src/orchestrator/types'

let tmpDir: string
let productDir: string
let fake: FakeAgentRunner

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'harness-sdk-t14-'))
  productDir = join(tmpDir, 'docs', 'product')
  mkdirSync(productDir, { recursive: true })
  fake = new FakeAgentRunner()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function setupTwoFeatures(f2Dependencies: string[] = []): void {
  const deps = f2Dependencies.length > 0 ? f2Dependencies.join(',') : '-'
  const backlog = [
    '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| F001 | Feature One | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
    `| F002 | Feature Two | sdk_core | backend | 2 | ${deps} | 0 | - | - | NOT_STARTED |`,
  ].join('\n')
  writeFileSync(join(productDir, 'BACKLOG.md'), backlog)
  writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), [
    '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ].join('\n'))
  writeFileSync(join(productDir, 'DECISIONS.md'), '# Decisions\n')
  writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify({
    scoreThresholdTL: 0.70,
    scoreThresholdAdv: 0.70,
    completionCriteria: { maxReworks: 2 },
    cycleCounter: { completedCycles: 0 },
  }, null, 2))
}

function makeFullRunFake(specDir: string): void {
  let tddCallCount = 0
  const tacticalDesignContent = [
    '# Tactical Design',
    '',
    '## Section 6 — Ordered Development Tasks',
    '',
    '```json',
    JSON.stringify([
      { id: '1', title: 'Implement core functionality', description: 'Implement the core functionality for the SDK' },
      { taskId: '2', title: 'Implement core functionality', description: 'Implement the core functionality for the SDK' }
    ]),
    '```',
  ].join('\n')
  const origRun = fake.run.bind(fake)
  fake.run = async (inv) => {
    if ((inv.skill ?? '').endsWith('scope-refinement')) {
      // Create spec files for the current feature, including a proper tactical design
      // with Section 6 tasks so PlanningHandler can extract tasks correctly.
      mkdirSync(specDir, { recursive: true })
      writeFileSync(join(specDir, '003-sdk_core-tactical-design.md'), tacticalDesignContent)
      writeFileSync(join(specDir, '004-sdk_core-test-scenarios.md'), '# Test Scenarios')
    }
    if ((inv.skill ?? '').endsWith('tdd-orchestrator')) {
      tddCallCount++
      writeFileSync(join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001' }))
    }
    return origRun(inv)
  }
  fake.setResponse('scope-refinement', { raw: 'ok' })
  fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
  fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
  fake.setResponse('project-memory', { raw: 'done' })
}

describe('T14 — HarnessOrchestrator TRANSITION + MEMORY', () => {
  describe('TS-F-02: RETRY once then PASS — reworks counter reflects one retry', () => {
    it('feature COMPLETED, Reworks=1, REWORK-LOG.md exists, completedCycles=1', async () => {
      // Setup at REVIEW starting point (TDD-OUTPUT present, tasks completed)
      const backlog = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | SDK Core | sdk_core | backend | 1 | - | 0 | - | - | IN_PROGRESS |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), backlog)
      const devState = [
        '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | T01 | sdk | task | sdk_core | IMPLEMENTATION | COMPLETED |',
      ].join('\n')
      writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), devState)
      writeFileSync(join(productDir, 'DECISIONS.md'), '# Decisions\n')
      writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify({
        scoreThresholdTL: 0.70,
        scoreThresholdAdv: 0.70,
        completionCriteria: { maxReworks: 2 },
        cycleCounter: { completedCycles: 0 },
      }, null, 2))

      const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
      mkdirSync(specDir, { recursive: true })
      writeFileSync(join(specDir, '004-sdk_core-test-scenarios.md'), '# Test Scenarios')
      writeFileSync(join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001' }))

      // First Phase C: failing scores → RETRY
      fake.enqueueResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.50}\n```' })
      // Second Phase C: passing scores → PASS
      fake.enqueueResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })

      // On RETRY, tasks reset to NOT_STARTED → DEVELOPMENT runs again → tdd-orchestrator creates TDD-OUTPUT
      const origRun = fake.run.bind(fake)
      fake.run = async (inv) => {
        if ((inv.skill ?? '').endsWith('tdd-orchestrator')) {
          writeFileSync(join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001' }))
        }
        return origRun(inv)
      }
      fake.setResponse('tdd-orchestrator', { raw: 'ok' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
      const features = fsm.loadBacklog()
      const f001 = features.find(f => f.id === 'F001')
      expect(f001?.status).toBe('COMPLETED')
      expect(f001?.reworks).toBe(1)

      const reworkLogPath = join(tmpDir, 'docs', 'specs', 'sdk_core', 'REWORK-LOG.md')
      expect(existsSync(reworkLogPath)).toBe(true)

      const cfg = fsm.loadBootstrapConfig()
      expect(cfg.cycleCounter.completedCycles).toBe(1)
    })
  })

  describe('TS-F-05: Two features sequential, both PASS', () => {
    it('both features COMPLETED, completedCycles=2', async () => {
      setupTwoFeatures()
      const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
      makeFullRunFake(specDir)

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
      const features = fsm.loadBacklog()
      expect(features.find(f => f.id === 'F001')?.status).toBe('COMPLETED')
      expect(features.find(f => f.id === 'F002')?.status).toBe('COMPLETED')
      const cfg = fsm.loadBootstrapConfig()
      expect(cfg.cycleCounter.completedCycles).toBe(2)
    })
  })

  describe('TS-F-06: Two features, first BLOCKED causes cascade', () => {
    it('F001 pre-BLOCKED → F002 CASCADE_BLOCKED when processing F002 in PLANNING', async () => {
      // Pre-set F001 as BLOCKED, F002 depends on F001
      // Orchestrator starts at PLANNING for F002, discovers dependency is BLOCKED → CASCADE_BLOCKED
      const backlog = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | Feature One | sdk_core | backend | 1 | - | 2 | 0.50 | 0.50 | BLOCKED |',
        '| F002 | Feature Two | sdk_core | backend | 2 | F001 | 0 | - | - | NOT_STARTED |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), backlog)
      writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), [
        '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
        '| --- | --- | --- | --- | --- | --- | --- |',
      ].join('\n'))
      writeFileSync(join(productDir, 'DECISIONS.md'), '# Decisions\n')
      writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify({
        scoreThresholdTL: 0.70,
        scoreThresholdAdv: 0.70,
        completionCriteria: { maxReworks: 2 },
        cycleCounter: { completedCycles: 0 },
      }, null, 2))

      fake.setResponse('project-memory', { raw: 'done' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
      const features = fsm.loadBacklog()
      // F001 stays BLOCKED, F002 gets CASCADE_BLOCKED
      expect(features.find(f => f.id === 'F001')?.status).toBe('BLOCKED')
      expect(features.find(f => f.id === 'F002')?.status).toBe('BLOCKED')

      // DECISIONS.md contains cascade rationale
      const decisions = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      expect(decisions.toLowerCase()).toContain('cascade')
    })
  })

  describe('MEMORY invokes project-memory', () => {
    it('project-memory skill called after completion', async () => {
      const backlog = [
        '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | SDK Core | sdk_core | backend | 1 | - | 0 | - | - | IN_PROGRESS |',
      ].join('\n')
      writeFileSync(join(productDir, 'BACKLOG.md'), backlog)
      const devState = [
        '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | T01 | sdk | task | sdk_core | IMPLEMENTATION | COMPLETED |',
      ].join('\n')
      writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), devState)
      writeFileSync(join(productDir, 'DECISIONS.md'), '# Decisions\n')
      writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify({
        scoreThresholdTL: 0.70,
        scoreThresholdAdv: 0.70,
        completionCriteria: { maxReworks: 2 },
        cycleCounter: { completedCycles: 0 },
      }, null, 2))

      const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
      mkdirSync(specDir, { recursive: true })
      writeFileSync(join(specDir, '004-sdk_core-test-scenarios.md'), '# Test Scenarios')
      writeFileSync(join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001' }))

      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      expect(fake.getInvocationsForSkill('project-memory').length).toBe(1)
    })
  })
})
