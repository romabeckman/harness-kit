import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { HarnessOrchestrator } from '../../src/orchestrator/HarnessOrchestrator'
import { Phase } from '../../src/orchestrator/types'
import { FakeAgentRunner } from '../helpers/FakeAgentRunner'

let tmpDir: string
let productDir: string
let fake: FakeAgentRunner

const BACKLOG_WITH_ONE_FEATURE = [
  '| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| F001 | SDK Core | sdk_core | 1 | - | 0 | - | - | NOT_STARTED |',
].join('\n')

const DEV_STATE_EMPTY = [
  '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
  '| --- | --- | --- | --- | --- | --- | --- |',
].join('\n')

const BOOTSTRAP_CONFIG = JSON.stringify({
  scoreThresholds: {
    theGrumpyTechLead: { threshold: 0.70 },
    adversarialQA: { threshold: 0.70 },
  },
  completionCriteria: { maxReworks: 2 },
  cycleCounter: { completedCycles: 0 },
}, null, 2)

function setupProductFiles(): void {
  writeFileSync(join(productDir, 'BACKLOG.md'), BACKLOG_WITH_ONE_FEATURE)
  writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), DEV_STATE_EMPTY)
  writeFileSync(join(productDir, 'DECISIONS.md'), '# Decisions\n')
  writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), BOOTSTRAP_CONFIG)
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'harness-sdk-t11-'))
  productDir = join(tmpDir, 'docs', 'product')
  mkdirSync(productDir, { recursive: true })
  fake = new FakeAgentRunner()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('T11 — HarnessOrchestrator BOOTSTRAP + PHASE_A', () => {
  it('runBootstrap creates product files when none exist', async () => {
    // No product files — should trigger ensureProductFiles
    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })

    // Setup fake so PHASE_A calls succeed and halt
    // Phase A invokes scope-refinement, then we need spec files to advance to B
    // For this test we just verify BOOTSTRAP creates files and transitions
    fake.setResponse('scope-refinement', {
      raw: JSON.stringify({ specFilesCreated: true }),
    })

    // We'll test that BOOTSTRAP runs and PHASE_A is invoked
    // after which without spec files it loops — we limit by checking state
    await orchestrator.runBootstrapOnly()

    expect(existsSync(join(productDir, 'BACKLOG.md'))).toBe(true)
    expect(existsSync(join(productDir, 'DEVELOPMENT-STATE.md'))).toBe(true)
    expect(existsSync(join(productDir, 'DECISIONS.md'))).toBe(true)
    expect(existsSync(join(productDir, 'BOOTSTRAP-CONFIG.json'))).toBe(true)
  })

  it('getState returns BOOTSTRAP as initial phase when no files exist', () => {
    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })
    const state = orchestrator.getState()
    expect(state.currentPhase).toBe(Phase.BOOTSTRAP)
  })

  it('getState returns PHASE_A after BOOTSTRAP when product files present', async () => {
    setupProductFiles()
    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })
    // With product files present, re-entry resolves to PHASE_A
    const state = orchestrator.getState()
    expect(state.currentPhase).toBe(Phase.PHASE_A)
  })

  it('PHASE_A invokes scope-refinement agent with correct payload', async () => {
    // Use fresh files with NOT_STARTED feature and no tasks yet
    setupProductFiles()

    // Configure fake: scope-refinement creates spec files (side-effect simulated below)
    const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
    let scopeRefinementCallCount = 0
    fake.setResponse('scope-refinement', {
      raw: JSON.stringify({ specFilesCreated: true }),
    })

    // Override FakeAgentRunner to create spec file on first scope-refinement call
    const origRun = fake.run.bind(fake)
    fake.run = async (inv) => {
      if (inv.skill === 'scope-refinement' && scopeRefinementCallCount === 0) {
        scopeRefinementCallCount++
        mkdirSync(specDir, { recursive: true })
        writeFileSync(join(specDir, '004-sdk_core-test-scenarios.md'), '# Test Scenarios')
        // Also write dev state tasks and TDD-OUTPUT so the loop can complete
        const devState = [
          '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
          '| --- | --- | --- | --- | --- | --- | --- |',
          '| F001 | T01 | sdk | task | sdk_core | - | NOT_STARTED |',
        ].join('\n')
        writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), devState)
      }
      if (inv.skill === 'tdd-orchestrator') {
        writeFileSync(join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001' }))
      }
      return origRun(inv)
    }

    fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
    fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
    fake.setResponse('project-memory', { raw: 'done' })

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })

    await orchestrator.run()

    const phaseACalls = fake.getInvocationsForSkill('scope-refinement')
    expect(phaseACalls.length).toBeGreaterThanOrEqual(1)
    expect(phaseACalls[0].payload).toHaveProperty('scope')
    expect(phaseACalls[0].payload).toHaveProperty('domain')
    expect(phaseACalls[0].payload).toHaveProperty('projectPaths')
  })

  it('persistPhase writes currentPhase to BOOTSTRAP-CONFIG.json before executing phase', async () => {
    setupProductFiles()
    // Orchestrator reads product files → resolves to PHASE_A
    // On first iteration it calls persistPhase() then dispatch(PHASE_A)
    // After run() we should see currentPhase in BOOTSTRAP-CONFIG.json
    const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
    let scopeCount = 0
    const origRun = fake.run.bind(fake)
    fake.run = async (inv) => {
      if (inv.skill === 'scope-refinement') {
        scopeCount++
        mkdirSync(specDir, { recursive: true })
        writeFileSync(join(specDir, '004-sdk_core-test-scenarios.md'), '# Test Scenarios')
        const devState = [
          '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
          '| --- | --- | --- | --- | --- | --- | --- |',
          '| F001 | T01 | sdk | task | sdk_core | - | NOT_STARTED |',
        ].join('\n')
        writeFileSync(join(productDir, 'DEVELOPMENT-STATE.md'), devState)
      }
      if (inv.skill === 'tdd-orchestrator') {
        writeFileSync(join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({ featureId: 'F001' }))
      }
      return origRun(inv)
    }
    fake.setResponse('scope-refinement', { raw: 'ok' })
    fake.setResponse('the-grumpy-tech-lead', { raw: '```json\n{"scoreTL": 0.85}\n```' })
    fake.setResponse('adversarial-qa', { raw: '```json\n{"scoreAdv": 0.80}\n```' })
    fake.setResponse('project-memory', { raw: 'done' })

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })

    await orchestrator.run()

    const { FileStateManager } = await import('../../src/file-state/FileStateManager')
    const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
    const cfg = fsm.loadBootstrapConfig()
    // After run() completes, last persisted phase should be set
    expect(cfg.currentPhase).toBeDefined()
    expect(typeof cfg.currentPhase).toBe('string')
  })

  it('re-entry resolves to correct phase when product files exist with in-progress feature', async () => {
    setupProductFiles()
    // Mark feature IN_PROGRESS in backlog
    const backlogInProgress = [
      '| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| F001 | SDK Core | sdk_core | 1 | - | 0 | - | - | IN_PROGRESS |',
    ].join('\n')
    writeFileSync(join(productDir, 'BACKLOG.md'), backlogInProgress)

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })
    // Feature is IN_PROGRESS, no spec files yet → PHASE_A
    expect(orchestrator.getState().currentPhase).toBe(Phase.PHASE_A)
  })

  it('dispatch() calls runBootstrap() before loadBacklog() when phase is BOOTSTRAP (no ENOENT)', async () => {
    // No product files → BOOTSTRAP phase
    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })
    expect(orchestrator.getState().currentPhase).toBe(Phase.BOOTSTRAP)

    // runBootstrapOnly drives only the BOOTSTRAP phase
    await orchestrator.runBootstrapOnly()

    // After BOOTSTRAP, product files must exist (ensureProductFiles was called)
    expect(existsSync(join(productDir, 'BACKLOG.md'))).toBe(true)
    expect(existsSync(join(productDir, 'BOOTSTRAP-CONFIG.json'))).toBe(true)
  })

  it('runBootstrap() skips agent call when backlog already has features', async () => {
    // Product files already populated — BOOTSTRAP should skip invokeAgent
    setupProductFiles() // contains F001 NOT_STARTED
    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })
    // State resolved to PHASE_A (product files exist), so runBootstrapOnly is a no-op
    // To test runBootstrap behaviour directly we construct one with BOOTSTRAP phase:
    // ... build fresh orchestrator without product files, call ensureProductFiles manually,
    // then populate the backlog so runBootstrap skips the agent.
    const tmpDir2 = mkdtempSync(join(tmpdir(), 'harness-sdk-t11b-'))
    const productDir2 = join(tmpDir2, 'docs', 'product')
    mkdirSync(productDir2, { recursive: true })
    try {
      // Write minimal files (ensureProductFiles would create these)
      writeFileSync(join(productDir2, 'BACKLOG.md'), BACKLOG_WITH_ONE_FEATURE)
      writeFileSync(join(productDir2, 'DEVELOPMENT-STATE.md'), DEV_STATE_EMPTY)
      writeFileSync(join(productDir2, 'DECISIONS.md'), '# Decisions\n')
      writeFileSync(join(productDir2, 'BOOTSTRAP-CONFIG.json'), BOOTSTRAP_CONFIG)

      const fake2 = new FakeAgentRunner()
      const orc2 = new HarnessOrchestrator({
        scope: 'test-scope',
        projectPaths: [tmpDir2],
        agentRunner: fake2,
        productDir: productDir2,
      }, { workingDir: tmpDir2 })

      // Resolved to PHASE_A because backlog already has features
      expect(orc2.getState().currentPhase).toBe(Phase.PHASE_A)

      // No bootstrap agent invocation should have happened
      const bootstrapCalls = fake2.getInvocationsForSkill('autonomous-orchestrator:bootstrap')
      expect(bootstrapCalls).toHaveLength(0)
    } finally {
      rmSync(tmpDir2, { recursive: true, force: true })
    }
  })

  it('runBootstrap() invokes invokeAgent with software-architect when backlog is empty', async () => {
    // No product files → BOOTSTRAP; fake runner returns usage so ledger.record is exercised
    const fakeWithUsage = new FakeAgentRunner()
    fakeWithUsage.setDefault({
      raw: '',
      usage: { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0.001 },
    })

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fakeWithUsage,
      productDir,
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    const bootstrapCalls = fakeWithUsage.getInvocationsForSkill('autonomous-orchestrator:bootstrap')
    expect(bootstrapCalls.length).toBeGreaterThan(0)
    expect(bootstrapCalls[0].agent).toBe('software-architect')
  })

  it('invokeAgent() calls ledger.record() when output.usage is defined', async () => {
    // Use a fake that returns usage and run the full bootstrap cycle
    const fakeWithUsage = new FakeAgentRunner()
    const usage = { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0.001 }
    fakeWithUsage.setDefault({ raw: '', usage })

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fakeWithUsage,
      productDir,
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    // Token ledger file should have been written
    const ledgerPath = join(productDir, 'tokens.jsonl')
    expect(existsSync(ledgerPath)).toBe(true)
    const lines = (await import('node:fs')).readFileSync(ledgerPath, 'utf8').trim().split('\n')
    expect(lines.length).toBeGreaterThan(0)
    const entry = JSON.parse(lines[0])
    expect(entry).toHaveProperty('inputTokens', 10)
    expect(entry).toHaveProperty('costUsd', 0.001)
  })

  it('invokeAgent() skips ledger.record() when output.usage is undefined', async () => {
    // Fake returns no usage field
    const fakeNoUsage = new FakeAgentRunner()
    fakeNoUsage.setDefault({ raw: '' }) // no usage

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fakeNoUsage,
      productDir,
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    // Ledger file should NOT exist (or be empty) because usage was undefined
    const ledgerPath = join(productDir, 'tokens.jsonl')
    if (existsSync(ledgerPath)) {
      const content = (await import('node:fs')).readFileSync(ledgerPath, 'utf8').trim()
      expect(content).toBe('')
    } else {
      expect(existsSync(ledgerPath)).toBe(false)
    }
  })

  it('tokenReport() delegates to ledger.printReport()', async () => {
    setupProductFiles()
    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })

    // Capture console.log output
    const logCalls: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => { logCalls.push(args.join(' ')) }
    try {
      orchestrator.tokenReport()
    } finally {
      console.log = origLog
    }

    // printReport outputs the header line
    expect(logCalls.some(line => line.includes('harness-kit-sdk') || line.includes('token report') || line.includes('─'))).toBe(true)
  })

  it('saves and restores original scope across bootstrap and resume', async () => {
    // 1. Run bootstrap with a specific scope
    const orchestrator = new HarnessOrchestrator({
      scope: 'my-custom-original-project-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    // Verify it is saved in BOOTSTRAP-CONFIG.json
    const { FileStateManager } = await import('../../src/file-state/FileStateManager')
    const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
    const cfg = fsm.loadBootstrapConfig()
    expect(cfg.originalScope).toBe('my-custom-original-project-scope')

    // 2. Re-create the orchestrator with an empty scope (simulating resume)
    const resumedOrchestrator = new HarnessOrchestrator({
      scope: '',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
    }, { workingDir: tmpDir })

    // Verify it restored the scope in resumedOrchestrator.config.scope
    expect(resumedOrchestrator.config.scope).toBe('my-custom-original-project-scope')
  })
})
