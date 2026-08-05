import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import spawn from 'cross-spawn';
import { SandboxEnvironment } from './SandboxEnvironment';
import { setupMockAgent } from './MockAgentCli';

describe('MockAgentCli Utility', () => {
  let sandbox: SandboxEnvironment | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should write executable stub script when configured with response options', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const scriptPath = await setupMockAgent(sandboxDir, {
      stdoutPayload: 'Mock agent response OK',
      exitCode: 0,
    });

    expect(fs.existsSync(scriptPath)).toBe(true);
    expect(scriptPath.startsWith(sandboxDir)).toBe(true);
  });

  it('Should emit configured stdout payload and exit code when stub script is spawned', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const scriptPath = await setupMockAgent(sandboxDir, {
      stdoutPayload: 'AGENT_PAYLOAD_TEST',
      exitCode: 2,
    });

    const result = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
      let stdout = '';
      const child = spawn('node', [scriptPath], { cwd: sandboxDir });
      if (child.pid) sandbox?.registerPid(child.pid);
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.on('close', (code) => {
        resolve({ code, stdout });
      });
    });

    expect(result.code).toBe(2);
    expect(result.stdout.trim()).toBe('AGENT_PAYLOAD_TEST');
  });
});
