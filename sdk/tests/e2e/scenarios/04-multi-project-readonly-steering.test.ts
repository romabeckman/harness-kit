import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SandboxEnvironment } from '../helpers/SandboxEnvironment';
import { setupMockBinaryInPath } from '../helpers/MockAgentCli';
import { runCliRun } from '../helpers/CliRunner';
import { computeDirChecksum, assertReadOnlyPathUnchanged } from '../helpers/AssertionHelpers';

describe('Scenario 4: Multi-Project Read-Only Boundary Safety', () => {
  let sandbox: SandboxEnvironment | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should execute multi-project orchestration keeping read-only reference directory strictly unmodified', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const appDir = path.join(sandboxDir, 'my-app');
    const readOnlyDir = path.join(sandboxDir, 'mcp-template');
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(readOnlyDir, { recursive: true });

    // Populate template files in readOnlyDir
    fs.writeFileSync(path.join(readOnlyDir, 'package.json'), JSON.stringify({ name: 'mcp-template', version: '1.0.0' }));
    fs.writeFileSync(path.join(readOnlyDir, 'index.ts'), '// Read-only template code');

    const initialChecksum = computeDirChecksum(readOnlyDir);

    const mockEnv = await setupMockBinaryInPath(sandboxDir, ['agy', 'claude'], {
      delayMs: 50,
      autoGenerateProductState: false,
    });

    const productDir = path.join(appDir, 'docs', 'product');
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(path.join(productDir, 'SCOPE.md'), 'Multi-project scope');

    const backlogTable = `# BACKLOG
| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
|---|---|---|---|---|---|---|---|---|---|
| F003 | Multi Project Feature | multi_project_telemetry_and_quota_e2e | backend | 1 | None | 0 | - | - | IN_PROGRESS |
`;
    fs.writeFileSync(path.join(productDir, 'BACKLOG.md'), backlogTable);

    const devState = `# Development State
| Feature | Task | Agent | Status |
|---|---|---|---|
| F003 | T01 | backend | IN_PROGRESS |
`;
    fs.writeFileSync(path.join(productDir, 'DEVELOPMENT-STATE.md'), devState);

    const specDir = path.join(appDir, 'docs', 'specs', 'multi_project_telemetry_and_quota_e2e');
    fs.mkdirSync(specDir, { recursive: true });
    const tacticalDesign = [
      { id: 'T01', title: 'Task 1', scope: ['src/index.ts'] }
    ];
    fs.writeFileSync(path.join(specDir, '003-sdk-tactical-design.md'), JSON.stringify(tacticalDesign, null, 2));
    fs.writeFileSync(path.join(specDir, 'TDD-OUTPUT.json'), JSON.stringify({
      featureId: 'F003',
      status: 'SUCCESS',
      metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 },
      modifiedFiles: ['src/index.ts'],
      reworksCount: 0
    }, null, 2));

    const bootConfig = {
      currentPhase: 'DEVELOPMENT',
      activeFeatureId: 'F003',
      projectPaths: [appDir, readOnlyDir],
      readOnlyPaths: [readOnlyDir],
      completionCriteria: { maxReworks: 1 },
      cycleCounter: { completedCycles: 0 },
      scoreThresholdTL: 0.7,
      scoreThresholdAdv: 0.7,
    };
    fs.writeFileSync(path.join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify(bootConfig, null, 2));
    fs.writeFileSync(path.join(productDir, 'DECISIONS.md'), '# Decisions\n');

    const res = await runCliRun(
      sandbox,
      appDir,
      [
        '--resume',
        '--agent', 'antigravity-cli',
        '--path', appDir,
        '--path', readOnlyDir,
        '--mode', 'quick',
        '--skip-deploy',
      ],
      mockEnv
    );

    if (res.exitCode !== 0) {
      console.log('SCENARIO 04 STDOUT:', res.stdout);
      console.log('SCENARIO 04 STDERR:', res.stderr);
    }
    // Verify exit code and read-only path checksum remains unchanged
    expect(res.exitCode).toBe(0);
    assertReadOnlyPathUnchanged(readOnlyDir, initialChecksum);
  }, 60000);
});
