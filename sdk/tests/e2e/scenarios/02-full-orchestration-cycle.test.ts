import { describe, it, expect, afterEach } from 'vitest';
import { SandboxEnvironment } from '../helpers/SandboxEnvironment';
import { OrchestrationStateValidator } from '../helpers/OrchestrationStateValidator';
import { setupMockBinaryInPath } from '../helpers/MockAgentCli';
import { runCliRun } from '../helpers/CliRunner';

describe('Scenario 2: Full Orchestration Lifecycle (hrns run --reset)', () => {
  let sandbox: SandboxEnvironment | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should execute full 6-phase orchestrator lifecycle end-to-end when invoked with reset flag', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const mockEnv = await setupMockBinaryInPath(sandboxDir);

    const res = await runCliRun(
      sandbox,
      sandboxDir,
      [
        '--reset',
        '--scope', 'E2E Lifecycle Feature',
        '--agent', 'antigravity-cli',
        '--mode', 'quick',
        '--skip-deploy',
      ],
      mockEnv
    );

    expect(res.exitCode).toBe(0);

    const validator = new OrchestrationStateValidator(sandboxDir);
    const tasks = validator.getBacklogTasks();
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].status).toBe('COMPLETED');
  }, 60000);
});
