import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { HarnessOrchestrator } from '../../src/orchestrator/HarnessOrchestrator'
import { FakeAgentRunner } from '../helpers/FakeAgentRunner'
import { FileStateManager } from '../../src/file-state/FileStateManager'

let tmpDir: string
let productDir: string
let fake: FakeAgentRunner

function setupFullRun(options: {
  reworks?: number
  backlogStatus?: string
  maxReworks?: number
} = {}): void {
  const { reworks = 0, backlogStatus = 'IN_PROGRESS', maxReworks = 2 } = options

  const backlog = [
    '| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    `| F001 | SDK Core | sdk_core | 1 | - | ${reworks} | - | - | ${backlogStatus} |`,
  ].join('\n')
  writeFileSync(join(productDir, 'BACKLOG.md'), backlog)

  // Start with all tasks completed + TDD-OUTPUT present (jump straight to PHASE_C)
  const devState = [
    '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| F001 | T01 | sdk | task one | sdk_core | IMPLEMENTATION | COMPLETED |',
  ].join('\n')
  writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), devState)
  writeFileSync(join(productDir, 'DECISIONS.md'), '# Decisions\n')
  writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify({
    scoreThresholds: {
      theGrumpyTechLead: { threshold: 0.70 },
      adversarialQA: { threshold: 0.70 },
    },
    completionCriteria: { maxReworks },
    cycleCounter: { completedCycles: 0 },
  }, null, 2))

  const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
  mkdirSync(specDir, { recursive: true })
  writeFileSync(join(specDir, '004-sdk_core-test-scenarios.md'), '# Test Scenarios')
  writeFileSync(join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001', tasksCompleted: 1 }))
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'harness-sdk-t13-'))
  productDir = join(tmpDir, 'docs', 'product')
  mkdirSync(productDir, { recursive: true })
  fake = new FakeAgentRunner()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('T13 — HarnessOrchestrator PHASE_C', () => {
  describe('TS-F-01: PASS on first attempt', () => {
    it('feature COMPLETED with correct scores after PASS', async () => {
      setupFullRun()
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
      const features = fsm.loadBacklog()
      expect(features.find(f => f.id === 'F001')?.status).toBe('COMPLETED')
      expect(features.find(f => f.id === 'F001')?.scoreTL).toBe(0.85)
      expect(features.find(f => f.id === 'F001')?.scoreAdv).toBe(0.80)
    })

    it('completedCycles increments to 1 after HALT (TS-F-01)', async () => {
      setupFullRun()
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
      const cfg = fsm.loadBootstrapConfig()
      expect(cfg.cycleCounter.completedCycles).toBe(1)
    })
  })

  describe('TS-F-03: BLOCK after maxReworks — feature BLOCKED', () => {
    it('feature status is BLOCKED (not FAILED) when isCrashing=true and reworks exhausted', async () => {
      // Setup with reworks already at max (2) and failing scores
      setupFullRun({ reworks: 2, maxReworks: 2 })
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.50}\n```' })
      // adversarial-qa signals isCrashing=true — must be extracted and passed to ValidationGate
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.50, "isCrashing": true, "hasHighCriticalVuln": true}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
      const features = fsm.loadBacklog()
      const f = features.find(f => f.id === 'F001')
      // isCrashing=true + maxReworks exhausted → BLOCK verdict → BLOCKED status
      expect(f?.status).toBe('BLOCKED')
    })
  })

  describe('TS-F-04: FAIL after maxReworks — feature FAILED', () => {
    it('feature FAILED when scores below threshold and reworks exhausted', async () => {
      setupFullRun({ reworks: 2, maxReworks: 2 })
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.50}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.50}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
      const features = fsm.loadBacklog()
      expect(features.find(f => f.id === 'F001')?.status).toBe('FAILED')
    })

    it('DECISIONS.md contains fail rationale', async () => {
      setupFullRun({ reworks: 2, maxReworks: 2 })
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.50}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.50}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const decisions = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      expect(decisions).toContain('FAIL')
    })
  })

  describe('TS-F-08: IAgentRunner called with correct skill per phase', () => {
    it('invocation log has scope-refinement, tdd-orchestrator, the-grumpy-tech-lead, adversarial-qa, project-memory', async () => {
      // Full fresh run — setup files so BOOTSTRAP runs and phases execute sequentially
      writeFileSync(join(productDir, 'BACKLOG.md'), [
        '| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | SDK Core | sdk_core | 1 | - | 0 | - | - | NOT_STARTED |',
      ].join('\n'))
      writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), [
        '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
        '| --- | --- | --- | --- | --- | --- | --- |',
      ].join('\n'))
      writeFileSync(join(productDir, 'DECISIONS.md'), '# Decisions\n')
      writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify({
        scoreThresholds: {
          theGrumpyTechLead: { threshold: 0.70 },
          adversarialQA: { threshold: 0.70 },
        },
        completionCriteria: { maxReworks: 2 },
        cycleCounter: { completedCycles: 0 },
      }, null, 2))

      const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
      let tddCallCount = 0
      const origRun = fake.run.bind(fake)
      fake.run = async (inv) => {
        if (inv.skill === 'scope-refinement') {
          mkdirSync(specDir, { recursive: true })
          writeFileSync(join(specDir, '004-sdk_core-test-scenarios.md'), '# Test Scenarios')
          // Also create a dev state task
          const devState = [
            '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
            '| --- | --- | --- | --- | --- | --- | --- |',
            '| F001 | T01 | sdk | task | sdk_core | - | NOT_STARTED |',
          ].join('\n')
          writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), devState)
        }
        if (inv.skill === 'tdd-orchestrator') {
          tddCallCount++
          writeFileSync(join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001' }))
        }
        return origRun(inv)
      }

      fake.setResponse('scope-refinement', { raw: 'ok' })
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const skills = fake.invocations.map(i => i.skill)
      expect(skills).toContain('scope-refinement')
      expect(skills).toContain('tdd-orchestrator')
      expect(skills).toContain('the-grumpy-tech-lead')
      expect(skills).toContain('adversarial-qa')
      expect(skills).toContain('project-memory')
    })
  })

  describe('TS-F-09: Context payload does not contain extraneous fields', () => {
    it('Phase A payload has exactly scope, domain, projectPaths', async () => {
      setupFullRun()
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
      fake.setResponse('project-memory', { raw: 'done' })
      fake.setResponse('scope-refinement', { raw: 'ok' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const phaseACalls = fake.getInvocationsForSkill('scope-refinement')
      if (phaseACalls.length > 0) {
        const payload = phaseACalls[0].payload
        expect(Object.keys(payload)).toHaveLength(3)
        expect(payload).toHaveProperty('scope')
        expect(payload).toHaveProperty('domain')
        expect(payload).toHaveProperty('projectPaths')
      }

      const phaseCCalls = fake.getInvocationsForSkill('the-grumpy-tech-lead')
      if (phaseCCalls.length > 0) {
        const payload = phaseCCalls[0].payload
        expect(payload).toHaveProperty('featureId')
        expect(payload).toHaveProperty('domain')
        expect(payload).toHaveProperty('projectPaths')
        expect(Object.keys(payload)).toHaveLength(3)
      }
    })
  })
})
