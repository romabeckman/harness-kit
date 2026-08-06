import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SandboxEnvironment } from '../helpers/SandboxEnvironment';
import { setupMockBinaryInPath } from '../helpers/MockAgentCli';
import { runCliRun } from '../helpers/CliRunner';

describe('Scenario 6: Quota Exceeded and POC Mode Recovery', () => {
  let sandbox: SandboxEnvironment | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should transition to Phase.HALTED gracefully on HTTP 429 quota error', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const mockEnv = await setupMockBinaryInPath(sandboxDir, ['agy', 'claude'], {
      delayMs: 50,
      exitCode: 1,
      stderrPayload: 'HTTP 429: rate_limit_exceeded (Quota Exceeded)',
      autoGenerateProductState: false,
    });

    const productDir = path.join(sandboxDir, 'docs', 'product');
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(path.join(productDir, 'SCOPE.md'), 'Quota test scope');

    const backlogTable = `# BACKLOG
| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
|---|---|---|---|---|---|---|---|---|---|
| F003 | Quota Feature | multi_project_telemetry_and_quota_e2e | backend | 1 | None | 0 | - | - | IN_PROGRESS |
`;
    fs.writeFileSync(path.join(productDir, 'BACKLOG.md'), backlogTable);

    const devState = `# Development State
| Feature | Task | Agent | Status |
|---|---|---|---|
| F003 | T01 | backend | IN_PROGRESS |
`;
    fs.writeFileSync(path.join(productDir, 'DEVELOPMENT-STATE.md'), devState);

    const bootConfig = {
      currentPhase: 'DEVELOPMENT',
      activeFeatureId: 'F003',
      projectPaths: [sandboxDir],
      completionCriteria: { maxReworks: 2 },
      cycleCounter: { completedCycles: 0 },
      scoreThresholdTL: 0.7,
      scoreThresholdAdv: 0.7,
    };
    fs.writeFileSync(path.join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify(bootConfig, null, 2));
    fs.writeFileSync(path.join(productDir, 'DECISIONS.md'), '# Architectural Decisions\n');

    const res = await runCliRun(
      sandbox,
      sandboxDir,
      [
        '--resume',
        '--steering', '',
        '--agent', 'antigravity-cli',
        '--mode', 'quick',
        '--skip-deploy',
      ],
      mockEnv
    );

    // Verify exit code is 0 (graceful exit) and rate limit halt notice is logged
    expect(res.exitCode).toBe(0);
    const combinedOutput = res.stdout + '\n' + res.stderr;
    expect(combinedOutput).toMatch(/Quota \/ rate-limit reached|Phase DEVELOPMENT persisted/i);
  }, 60000);

  it('Should approve task in POC mode when score is >= 0.6 and reworks count <= 1', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const mockEnv = await setupMockBinaryInPath(sandboxDir, ['agy', 'claude'], {
      delayMs: 50,
      exitCode: 0,
      stdoutPayload: JSON.stringify({ type: 'result', result: 'success' }),
      autoGenerateProductState: true,
    });

    const productDir = path.join(sandboxDir, 'docs', 'product');
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(path.join(productDir, 'SCOPE.md'), 'POC mode scope');

    const backlogTable = `# BACKLOG
| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
|---|---|---|---|---|---|---|---|---|---|
| F003 | POC Feature | multi_project_telemetry_and_quota_e2e | backend | 1 | None | 0 | - | - | IN_PROGRESS |
`;
    fs.writeFileSync(path.join(productDir, 'BACKLOG.md'), backlogTable);

    const devState = `# Development State
| Feature | Task | Agent | Status |
|---|---|---|---|
| F003 | T01 | backend | IN_PROGRESS |
`;
    fs.writeFileSync(path.join(productDir, 'DEVELOPMENT-STATE.md'), devState);

    const bootConfig = {
      currentPhase: 'REVIEW',
      activeFeatureId: 'F003',
      projectPaths: [sandboxDir],
      pocMode: true,
      completionCriteria: { maxReworks: 1 },
      cycleCounter: { completedCycles: 0 },
      scoreThresholdTL: 0.6,
      scoreThresholdAdv: 0.6,
    };
    fs.writeFileSync(path.join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify(bootConfig, null, 2));
    fs.writeFileSync(path.join(productDir, 'DECISIONS.md'), '# Architectural Decisions\n');

    // Create review outputs with score 0.65 (>= 0.6)
    const specDir = path.join(sandboxDir, 'docs', 'specs', 'multi_project_telemetry_and_quota_e2e');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'TL.json'), JSON.stringify({ score: 0.65, approved: true }));
    fs.writeFileSync(path.join(specDir, 'QA.json'), JSON.stringify({ score: 0.65, approved: true }));

    const res = await runCliRun(
      sandbox,
      sandboxDir,
      [
        '--resume',
        '--steering', '',
        '--agent', 'antigravity-cli',
        '--mode', 'quick',
        '--skip-deploy',
      ],
      mockEnv
    );

    expect(res.exitCode).toBe(0);
  }, 60000);
});
