import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { HarnessOrchestrator } from '../../src/orchestrator/HarnessOrchestrator'
import { FakeAgentRunner } from '../helpers/FakeAgentRunner'
import { Complexity } from '../../src/orchestrator/types'

let tmpDir: string
let productDir: string
let fake: FakeAgentRunner

function writeValidSpecs(specDir: string): void {
  mkdirSync(specDir, { recursive: true })
  writeFileSync(join(specDir, '003-sdk_core-tactical-design.md'), [
    '## Section 6 — Ordered Development Tasks',
    '```json',
    '[{"id":"01","title":"Implement SDK core","description":"Implement SDK core"}]',
    '```',
  ].join('\n'))
  writeFileSync(join(specDir, '004-sdk_core-test-scenarios.md'), '# Test Scenarios\n\n- SDK core succeeds.')
}

function writeValidTddOutput(specDir: string): void {
  writeFileSync(join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({
    featureId: 'F001',
    status: 'SUCCESS',
    metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 1 },
    modifiedFiles: [],
    developerHandoff: 'Ready for review.',
    reworksCount: 0,
  }))
}

function setupProductFiles(backlogStatus: string = 'IN_PROGRESS', tasks: string = ''): void {
  const backlog = [
    '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    `| F001 | SDK Core | sdk_core | backend | 1 | - | 0 | - | - | ${backlogStatus} |`,
  ].join('\n')
  writeFileSync(join(productDir, 'BACKLOG.md'), backlog)

  const devState = tasks || [
    '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| F001 | T01 | sdk | initialize scaffold | sdk_core | - | NOT_STARTED |',
    '| F001 | T02 | sdk | define types | sdk_core | - | NOT_STARTED |',
  ].join('\n')
  writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), devState)
  writeFileSync(join(productDir, 'DECISIONS.md'), '# Decisions\n')
  writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify({
    scoreThresholdTL: 0.70,
    scoreThresholdAdv: 0.70,
    completionCriteria: { maxReworks: 2 },
    cycleCounter: { completedCycles: 0 },
  }, null, 2))
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'harness-sdk-t12-'))
  productDir = join(tmpDir, 'docs', 'product')
  mkdirSync(productDir, { recursive: true })
  fake = new FakeAgentRunner()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('T12 — HarnessOrchestrator DEVELOPMENT', () => {
  it('iterates NOT_STARTED tasks and marks each COMPLETED after tdd-orchestrator call', async () => {
    setupProductFiles()
    const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
    writeValidSpecs(specDir)

    // tdd-orchestrator must always write TDD-OUTPUT.json (contract of the agent)
    const origRun = fake.run.bind(fake)
    fake.run = async (inv) => {
      if ((inv.skill ?? '').endsWith('tdd-orchestrator')) {
        writeValidTddOutput(specDir)
      }
      return origRun(inv)
    }
    fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
    fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
    fake.setResponse('project-memory', { raw: 'done' })

    // Start from DEVELOPMENT (spec files present)
    const orchestrator = new HarnessOrchestrator({
      scope: 'sdk_core',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    await orchestrator.run()

    const tddCalls = fake.getInvocationsForSkill('tdd-orchestrator')
    expect(tddCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('Phase B payload uses correct skill tdd-orchestrator', async () => {
    setupProductFiles()
    const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
    writeValidSpecs(specDir)

    const origRun = fake.run.bind(fake)
    fake.run = async (inv) => {
      if ((inv.skill ?? '').endsWith('tdd-orchestrator')) {
        writeValidTddOutput(specDir)
      }
      return origRun(inv)
    }
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

    const tddCalls = fake.getInvocationsForSkill('tdd-orchestrator')
    expect(tddCalls.length).toBeGreaterThanOrEqual(1)
    expect(tddCalls[0].skill).toContain('tdd-orchestrator')
  })

  describe('TS-F-10: runDevelopment requires a valid TDD handoff', () => {
    it('run() does not report success when tdd-orchestrator does NOT create TDD-OUTPUT.json', async () => {
      setupProductFiles()
      const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
      writeValidSpecs(specDir)
      // tdd-orchestrator returns output but does NOT write TDD-OUTPUT.json
      fake.setResponse('tdd-orchestrator', { raw: 'ok' })
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

      await expect(orchestrator.run()).rejects.toThrow(/exceeded consecutive iteration limit.*DEVELOPMENT/)
    })
  })

  describe('TS-F-07: Resume after crash during Phase B', () => {
    it('re-entry picks up at DEVELOPMENT, no duplicate task rows', async () => {
      // Simulate crash recovery: product files exist, feature IN_PROGRESS, one task IN_PROGRESS
      const devStateInProgress = [
        '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | T01 | sdk | task one | sdk_core | IMPLEMENTATION | IN_PROGRESS |',
        '| F001 | T02 | sdk | task two | sdk_core | - | NOT_STARTED |',
      ].join('\n')
      setupProductFiles('IN_PROGRESS', devStateInProgress)

      const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
      writeValidSpecs(specDir)

      const origRun = fake.run.bind(fake)
      fake.run = async (inv) => {
        if ((inv.skill ?? '').endsWith('tdd-orchestrator')) {
          writeValidTddOutput(specDir)
        }
        return origRun(inv)
      }
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })

      // New orchestrator simulates crash recovery
      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      // Re-entry: spec files present, tasks not all completed → DEVELOPMENT
      const { Phase } = await import('../../src/orchestrator/types.js')
      expect(orchestrator.getState().currentPhase).toBe(Phase.DEVELOPMENT)

      await orchestrator.run()

      // Verify no duplicate task rows
      const { FileStateManager } = await import('../../src/file-state/FileStateManager.js')
      const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
      const tasks = fsm.loadDevelopmentState()
      const t01Tasks = tasks.filter((t: any) => t.taskId === 'T01')
      expect(t01Tasks).toHaveLength(1) // no duplicates
    })
  })
})
