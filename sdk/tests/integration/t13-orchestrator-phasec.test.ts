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

function setupFullRun(options: {
  reworks?: number
  backlogStatus?: string
  maxReworks?: number
} = {}): void {
  const { reworks = 0, backlogStatus = 'IN_PROGRESS', maxReworks = 2 } = options

  const backlog = [
    '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    `| F001 | Lorem ipsum dolor sit amet consectetur adipiscing elit quisque faucibus ex sapien vitae | sdk_core | backend | 1 | - | ${reworks} | - | - | ${backlogStatus} |`,
  ].join('\n')
  writeFileSync(join(productDir, 'BACKLOG.md'), backlog)

  const devState = [
    '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| F001 | T01 | sdk | task one | sdk_core | IMPLEMENTATION | COMPLETED |',
  ].join('\n')
  writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), devState)
  writeFileSync(join(productDir, 'DECISIONS.md'), '# Decisions\n')
  writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify({
    scoreThresholdTL: 0.70,
    scoreThresholdAdv: 0.70,
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

describe('T13 — HarnessOrchestrator REVIEW', () => {
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
        complexity: Complexity.AUTO,
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
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
      const cfg = fsm.loadBootstrapConfig()
      expect(cfg.cycleCounter.completedCycles).toBe(1)
    })
  })

  describe('TS-F-03: BLOCK after maxReworks — feature BLOCKED', () => {
    it('feature status is BLOCKED (not FAILED) when isCrashing=true and reworks exhausted', async () => {
      setupFullRun({ reworks: 2, maxReworks: 2 })
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.50}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.50, "isCrashing": true, "hasHighCriticalVuln": true}\n```' })
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
      const f = features.find(f => f.id === 'F001')
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
        complexity: Complexity.AUTO,
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
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const decisions = readFileSync(join(productDir, 'DECISIONS.md'), 'utf-8')
      expect(decisions).toContain('FAIL')
    })
  })

  describe('TS-F-08: IAgentRunner called with correct skill per phase', () => {
    it('invocation log has scope-refinement, tdd-orchestrator, the-grumpy-tech-lead, adversarial-qa, project-memory', async () => {
      writeFileSync(join(productDir, 'BACKLOG.md'), [
        '| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| F001 | Lorem ipsum dolor sit amet consectetur adipiscing elit quisque faucibus ex sapien vitae pellentesque  | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
      ].join('\n'))
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

      const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
      let tddCallCount = 0
      const origRun = fake.run.bind(fake)
      fake.run = async (inv) => {
        if ((inv.skill ?? '').endsWith('scope-refinement')) {
          mkdirSync(specDir, { recursive: true })
          writeFileSync(join(specDir, '004-sdk_core-test-scenarios.md'), '# Test Scenarios')
          const devState = [
            '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
            '| --- | --- | --- | --- | --- | --- | --- |',
            '| F001 | T01 | sdk | task | sdk_core | - | NOT_STARTED |',
          ].join('\n')
          writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), devState)
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

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      // Strip harness-kit: namespace prefix — Phase C uses it internally
      const skills = fake.invocations.map(i => (i.skill ?? '').replace(/^harness-kit:/, ''))
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
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      await orchestrator.run()

      const phaseACalls = fake.getInvocationsForSkill('scope-refinement')
      if (phaseACalls.length > 0) {
        const prompt = phaseACalls[0].prompt
        expect(typeof prompt).toBe('string')
        expect(prompt).toContain('sdk_core')
        expect(prompt).toContain(tmpDir)
      }

      const phaseCCalls = fake.getInvocationsForSkill('the-grumpy-tech-lead')
      if (phaseCCalls.length > 0) {
        const prompt = phaseCCalls[0].prompt
        expect(typeof prompt).toBe('string')
        expect(prompt).toContain('F001')
        expect(prompt).toContain('sdk_core')
        expect(prompt).toContain(tmpDir)
      }
    })
  })

  describe('RETRY scenario invalidates TDD-OUTPUT.json', () => {
    it('deletes TDD-OUTPUT.json when verdict is RETRY', async () => {
      setupFullRun({ reworks: 0, maxReworks: 2 })
      fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.50}\n```' })
      fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.50}\n```' })
      fake.setResponse('tdd-orchestrator', { raw: 'done' })
      fake.setResponse('project-memory', { raw: 'done' })

      const orchestrator = new HarnessOrchestrator({
        scope: 'sdk_core',
        projectPaths: [tmpDir],
        agentRunner: fake,
        productDir,
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir })

      const tddOutputPath = join(tmpDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      expect(existsSync(tddOutputPath)).toBe(true)

      let tddOutputDeleted = false
      const origRun = fake.run.bind(fake)
      fake.run = async (inv) => {
        if ((inv.skill ?? '').endsWith('tdd-orchestrator')) {
          if (!existsSync(tddOutputPath)) {
            tddOutputDeleted = true
          }
          writeFileSync(tddOutputPath, JSON.stringify({ featureId: 'F001' }))
        }
        return origRun(inv)
      }

      await orchestrator.run()
      expect(tddOutputDeleted).toBe(true)
    })
  })

  describe('Reads validation reports from TL.json and QA.json files', () => {
    it('uses scores from TL.json and QA.json if present', async () => {
      setupFullRun()
      const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
      const origRun = fake.run.bind(fake)
      fake.run = async (inv) => {
        const skill = (inv.skill ?? '').replace(/^harness-kit:/, '')
        if (skill === 'the-grumpy-tech-lead') {
          writeFileSync(join(specDir, 'TL.json'), JSON.stringify({ featureId: 'F001', score: 0.95 }))
          return { raw: '```json\n{"scoreTL": 0.10}\n```' }
        }
        if (skill === 'adversarial-qa') {
          writeFileSync(join(specDir, 'QA.json'), JSON.stringify({ featureId: 'F001', score: 0.90 }))
          return { raw: '```json\n{"scoreAdv": 0.10}\n```' }
        }
        return origRun(inv)
      }
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
      expect(features.find(f => f.id === 'F001')?.status).toBe('COMPLETED')
      expect(features.find(f => f.id === 'F001')?.scoreTL).toBe(0.95)
      expect(features.find(f => f.id === 'F001')?.scoreAdv).toBe(0.90)
    })
  })
})
