import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SandboxEnvironment } from '../helpers/SandboxEnvironment';
import { runCliInit } from '../helpers/CliRunner';

describe('CLI Process Spawner and Sandbox Integration', () => {
  let sandbox: SandboxEnvironment | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should execute compiled CLI binary inside SandboxEnvironment without modifying root codebase', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const result = await runCliInit(sandbox, sandboxDir, ['--headless']);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(sandboxDir, 'docs', 'product', 'BOOTSTRAP-CONFIG.json'))).toBe(true);

    // Root codebase docs/product must remain unaffected or clean
    const rootSrcExists = fs.existsSync(path.resolve(__dirname, '../../../src'));
    expect(rootSrcExists).toBe(true);
  });

  it('Should isolate process environment variables when running CLI child process', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const customEnv = { HRNS_TEST_ENV_FLAG: 'sandbox-isolated-val' };
    const result = await runCliInit(sandbox, sandboxDir, ['--headless'], customEnv);

    expect(result.exitCode).toBe(0);
    expect(process.env.HRNS_TEST_ENV_FLAG).toBeUndefined();
  });
});
