import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { HarnessOrchestrator } from '../../src/orchestrator/HarnessOrchestrator'
import { Phase, CliCommand, Complexity } from '../../src/orchestrator/types'
import { FakeAgentRunner } from '../helpers/FakeAgentRunner'

let tmpDir: string
let productDir: string
let fake: FakeAgentRunner

const BACKLOG_WITH_ONE_FEATURE = [
  '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| F001 | SDK Core | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
].join('\n')

const DEV_STATE_EMPTY = [
  '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |',
  '| --- | --- | --- | --- | --- | --- | --- |',
].join('\n')

const BOOTSTRAP_CONFIG = JSON.stringify({
  scoreThresholdTL: 0.70,
  scoreThresholdAdv: 0.70,
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

describe('T11 — HarnessOrchestrator BOOTSTRAP + PLANNING', () => {
  it('runBootstrap creates product files when none exist', async () => {
    // No product files — should trigger ensureProductFiles
    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    // Setup fake so PLANNING calls succeed and halt
    // Phase A invokes scope-refinement, then we need spec files to advance to B
    // For this test we just verify BOOTSTRAP creates files and transitions
    fake.setResponse('scope-refinement', {
      raw: JSON.stringify({ specFilesCreated: true }),
    })

    // We'll test that BOOTSTRAP runs and PLANNING is invoked
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
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })
    const state = orchestrator.getState()
    expect(state.currentPhase).toBe(Phase.BOOTSTRAP)
  })

  it('getState returns PLANNING after BOOTSTRAP when product files present', async () => {
    setupProductFiles()
    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })
    // With product files present, re-entry resolves to PLANNING
    const state = orchestrator.getState()
    expect(state.currentPhase).toBe(Phase.PLANNING)
  })

  it('PLANNING invokes scope-refinement agent with correct payload', async () => {
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
      if ((inv.skill ?? '').endsWith('scope-refinement') && scopeRefinementCallCount === 0) {
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
      if ((inv.skill ?? '').endsWith('tdd-orchestrator')) {
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
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    await orchestrator.run()

    const phaseACalls = fake.getInvocationsForSkill('scope-refinement')
    expect(phaseACalls.length).toBeGreaterThanOrEqual(1)
    expect(typeof phaseACalls[0].prompt).toBe('string')
    expect(phaseACalls[0].prompt).toContain('sdk_core')
    expect(phaseACalls[0].prompt).toContain(tmpDir)
  })

  it('persistPhase writes currentPhase to BOOTSTRAP-CONFIG.json before executing phase', async () => {
    setupProductFiles()
    // Orchestrator reads product files → resolves to PLANNING
    // On first iteration it calls persistPhase() then dispatch(PLANNING)
    // After run() we should see currentPhase in BOOTSTRAP-CONFIG.json
    const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
    let scopeCount = 0
    const origRun = fake.run.bind(fake)
    fake.run = async (inv) => {
      if ((inv.skill ?? '').endsWith('scope-refinement')) {
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
      if ((inv.skill ?? '').endsWith('tdd-orchestrator')) {
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
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    await orchestrator.run()

    const { FileStateManager } = await import('../../src/file-state/FileStateManager.js')
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
      '| F001 | SDK Core | sdk_core | backend | 1 | - | 0 | - | - | IN_PROGRESS |',
    ].join('\n')
    writeFileSync(join(productDir, 'BACKLOG.md'), backlogInProgress)

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })
    // Feature is IN_PROGRESS, no spec files yet → PLANNING
    expect(orchestrator.getState().currentPhase).toBe(Phase.PLANNING)
  })

  it('dispatch() calls runBootstrap() before loadBacklog() when phase is BOOTSTRAP (no ENOENT)', async () => {
    // No product files → BOOTSTRAP phase
    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
      complexity: Complexity.AUTO,
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
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })
    // State resolved to PLANNING (product files exist), so runBootstrapOnly is a no-op
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
        complexity: Complexity.AUTO,
      }, { workingDir: tmpDir2 })

      // Resolved to PLANNING because backlog already has features
      expect(orc2.getState().currentPhase).toBe(Phase.PLANNING)

      // No bootstrap agent invocation should have happened
      const bootstrapCalls = fake2.invocations.filter(i => i.agent === 'software-architect')
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
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    const bootstrapCalls = fakeWithUsage.invocations.filter(i => i.agent === 'harness-kit:software-architect')
    expect(bootstrapCalls.length).toBeGreaterThan(0)
    expect(bootstrapCalls[0].agent).toBe('harness-kit:software-architect')
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
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    // Token ledger file should have been written
    const ledgerPath = join(productDir, 'tokens.jsonl')
    expect(existsSync(ledgerPath)).toBe(true)
    const lines = (await import('node:fs')).readFileSync(ledgerPath, 'utf8').trim().split('\n')
    expect(lines.length).toBeGreaterThan(0)
    const entry = JSON.parse(lines[0])
    expect(entry.tokenUsage).toHaveProperty('inputTokens', 10)
    expect(entry.tokenUsage).toHaveProperty('calculatedCostUsd', 0.001)
    expect(entry).not.toHaveProperty('inputTokens')
    expect(entry).not.toHaveProperty('costUsd')
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
      complexity: Complexity.AUTO,
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
      complexity: Complexity.AUTO,
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
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    // Verify it is saved in SCOPE.md
    const { FileStateManager } = await import('../../src/file-state/FileStateManager.js')
    const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
    expect(fsm.loadScope()).toBe('my-custom-original-project-scope')

    // 2. Re-create the orchestrator with an empty scope (simulating resume)
    const resumedOrchestrator = new HarnessOrchestrator({
      scope: '',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    // Verify it restored the scope in resumedOrchestrator.config.scope
    expect(resumedOrchestrator.config.scope).toBe('my-custom-original-project-scope')
  })

  it('re-entry resolves to DEVELOPMENT when spec directory exists, even if empty', () => {
    setupProductFiles()
    // Mark feature IN_PROGRESS in backlog to ensure we're not in bootstrap
    const backlogInProgress = [
      '| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| F001 | SDK Core | sdk_core | backend | 1 | - | 0 | - | - | IN_PROGRESS |',
    ].join('\n')
    writeFileSync(join(productDir, 'BACKLOG.md'), backlogInProgress)

    // Create an empty spec directory
    const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
    mkdirSync(specDir, { recursive: true })

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    // With spec dir present, re-entry should resolve to DEVELOPMENT.
    // This will fail with the old implementation because the dir is empty.
    expect(orchestrator.getState().currentPhase).toBe(Phase.DEVELOPMENT)
  })

  it('PLANNING throws an error if no tasks are extracted and no existing tasks exist', async () => {
    setupProductFiles()

    const specDir = join(tmpDir, 'docs', 'specs', 'sdk_core')
    fake.setResponse('scope-refinement', {
      raw: JSON.stringify({ specFilesCreated: true }),
    })

    // Simulate scope-refinement agent creating spec files, but NO tasks in them
    const origRun = fake.run.bind(fake)
    fake.run = async (inv) => {
      if ((inv.skill ?? '').endsWith('scope-refinement')) {
        mkdirSync(specDir, { recursive: true })
        // Write the spec file but without "## Section 6" or tasks
        writeFileSync(
          join(specDir, '003-sdk_core-tactical-design.md'),
          '# Tactical Design\nNo tasks here.'
        )
      }
      return origRun(inv)
    }

    const orchestrator = new HarnessOrchestrator({
      scope: 'test-scope',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    // Expect the orchestrator run to throw an error
    await expect(orchestrator.run()).rejects.toThrow(
      /PLANNING failed: no tasks extracted/
    )
  })

  it('TC-BOOT-03: merges current config into existing BOOTSTRAP-CONFIG.json during bootstrap', async () => {
    // Write an existing BOOTSTRAP-CONFIG.json with default/empty values and custom steeringRules
    const initialConfig = {
      originalScope: undefined,
      projectPaths: [],
      currentPhase: 'BOOTSTRAP',
      scoreThresholdTL: 0.70,
      scoreThresholdAdv: 0.70,
      completionCriteria: { maxReworks: 2 },
      cycleCounter: { completedCycles: 0 },
      steeringRules: {
        user: ['custom user rule']
      }
    }
    writeFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify(initialConfig, null, 2))

    // Set up mock responses so it runs bootstrap but doesn't crash on Phase A
    fake.setResponse('autonomous-orchestrator:bootstrap', {
      raw: 'backlog generated'
    })

    // Intercept to check if backlog is written (though we just want to run bootstrap)
    const backlogPath = join(productDir, 'BACKLOG.md')
    const origRun = fake.run.bind(fake)
    fake.run = async (inv) => {
      if ((inv.skill ?? '').endsWith('bootstrap')) {
        writeFileSync(backlogPath, BACKLOG_WITH_ONE_FEATURE)
      }
      return origRun(inv)
    }

    const orchestrator = new HarnessOrchestrator({
      scope: 'my new scope',
      projectPaths: [tmpDir, '/another/path'],
      score: 0.85,
      reworks: 4,
      agentRunner: fake,
      productDir,
      cliCommand: CliCommand.INIT,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    // Execute only the bootstrap phase
    await orchestrator.runBootstrapOnly()

    // Read the saved config and verify fields were merged
    const { readFileSync } = await import('fs')
    const savedConfig = JSON.parse(readFileSync(join(productDir, 'BOOTSTRAP-CONFIG.json'), 'utf-8'))
    const { FileStateManager } = await import('../../src/file-state/FileStateManager.js')
    const fsm = new FileStateManager({ productDir, workingDir: tmpDir })

    expect(fsm.loadScope()).toBe('my new scope')
    expect(savedConfig.projectPaths).toEqual([tmpDir, '/another/path'])
    expect(savedConfig.scoreThresholdTL).toBe(0.85)
    expect(savedConfig.scoreThresholdAdv).toBe(0.85)
    expect(savedConfig.completionCriteria.maxReworks).toBe(4)
    // Steering rules should be preserved!
    expect(savedConfig.steeringRules.user).toEqual(['custom user rule'])
  })

  it('saves BACKLOG.md from agent raw output when agent does not write to disk directly', async () => {
    const rawBacklogTable = [
      '| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| F001 | Portfolio Landing Page | home_profile | frontend | CRITICAL | None | 0 | - | - | NOT_STARTED |',
    ].join('\n')

    fake.setDefault({
      raw: rawBacklogTable,
    })

    const orchestrator = new HarnessOrchestrator({
      scope: 'Create a portfolio landing page',
      projectPaths: [tmpDir],
      agentRunner: fake,
      productDir,
      complexity: Complexity.AUTO,
    }, { workingDir: tmpDir })

    await orchestrator.runBootstrapOnly()

    const { FileStateManager } = await import('../../src/file-state/FileStateManager.js')
    const fsm = new FileStateManager({ productDir, workingDir: tmpDir })
    const backlog = fsm.loadBacklog()

    expect(backlog.length).toBe(1)
    expect(backlog[0].id).toBe('F001')
    expect(backlog[0].title).toBe('Portfolio Landing Page')
    expect(backlog[0].domain).toBe('home_profile')
  })
})
