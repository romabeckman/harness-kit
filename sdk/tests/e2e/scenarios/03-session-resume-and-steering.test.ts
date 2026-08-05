import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SandboxEnvironment } from '../helpers/SandboxEnvironment';
import { OrchestrationStateValidator } from '../helpers/OrchestrationStateValidator';
import { setupMockBinaryInPath } from '../helpers/MockAgentCli';
import { runCliRun, spawnCliRunProcess } from '../helpers/CliRunner';

describe('Scenario 3: Interruption Resume and Steering (hrns run --resume)', () => {
  let sandbox: SandboxEnvironment | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should recover from interruption and apply dynamic steering directives on session resume', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const mockEnv = await setupMockBinaryInPath(sandboxDir, ['agy', 'claude'], {
      delayMs: 100,
    });

    const productDir = path.join(sandboxDir, 'docs', 'product');
    fs.mkdirSync(productDir, { recursive: true });

    // Scope file required for session detection
    fs.writeFileSync(path.join(productDir, 'SCOPE.md'), 'E2E Resume Feature Scope');

    const backlogTable = `# BACKLOG
| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
|---|---|---|---|---|---|---|---|---|---|
| F001 | E2E Resume Feature | e2e_feature | backend | 1 | None | 0 | - | - | IN_PROGRESS |
`;
    fs.writeFileSync(path.join(productDir, 'BACKLOG.md'), backlogTable);

    const devState = `# Development State
| Feature | Task | Agent | Status |
|---|---|---|---|
| F001 | T01 | backend | IN_PROGRESS |
`;
    fs.writeFileSync(path.join(productDir, 'DEVELOPMENT-STATE.md'), devState);

    const bootConfig = {
      currentPhase: 'DEVELOPMENT',
      activeFeatureId: 'F001',
      projectPaths: [sandboxDir],
      completionCriteria: {
        maxReworks: 2,
      },
      cycleCounter: {
        completedCycles: 0,
      },
      scoreThresholdTL: 0.7,
      scoreThresholdAdv: 0.7,
      steeringRules: { user: ['initial rule'] },
    };
    fs.writeFileSync(path.join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify(bootConfig, null, 2));

    const decisionsContent = `# Architectural Decisions\n\n## Initial setup\n`;
    fs.writeFileSync(path.join(productDir, 'DECISIONS.md'), decisionsContent);

    // 1. Simulate process running and receiving SIGINT
    const child = spawnCliRunProcess(
      sandbox,
      sandboxDir,
      [
        '--resume',
        '--agent', 'antigravity-cli',
        '--mode', 'quick',
        '--skip-deploy',
      ],
      mockEnv
    );

    setTimeout(() => {
      try {
        if (child.pid) {
          if (process.platform === 'win32') {
            sandbox?.killProcessTree(child.pid);
          } else {
            child.kill('SIGINT');
          }
        }
      } catch {
        // process may have already exited
      }
    }, 100);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const validatorBefore = new OrchestrationStateValidator(sandboxDir);
    expect(() => validatorBefore.getBootstrapConfig()).not.toThrow();

    // 2. Resume session with --steering directive
    const res = await runCliRun(
      sandbox,
      sandboxDir,
      [
        '--resume',
        '--agent', 'antigravity-cli',
        '--steering', 'rollback to PLANNING, add rule: use Zod',
        '--mode', 'quick',
        '--skip-deploy',
      ],
      mockEnv
    );

    expect(res.exitCode).toBe(0);

    const validator = new OrchestrationStateValidator(sandboxDir);

    const config = validator.getBootstrapConfig();
    expect((config.steeringRules as any)?.user).toContain('rollback to PLANNING, add rule: use Zod');
    validator.assertDecisionsLog('Steering override');
  }, 60000);
});
