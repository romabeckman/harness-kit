import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import spawn from 'cross-spawn';
import { SandboxEnvironment } from './SandboxEnvironment';

describe('SandboxEnvironment Utility', () => {
  let sandbox: SandboxEnvironment | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should create an isolated sandbox directory when initialized', async () => {
    sandbox = new SandboxEnvironment();
    const dir = await sandbox.create();

    expect(typeof dir).toBe('string');
    expect(fs.existsSync(dir)).toBe(true);
    expect(dir.includes(path.normalize('tests/e2e/.temp'))).toBe(true);
  });

  it('Should track spawned subprocess PIDs when child process is launched inside sandbox', async () => {
    sandbox = new SandboxEnvironment();
    const dir = await sandbox.create();

    const child = spawn('node', ['-e', 'setTimeout(() => {}, 10000)'], { cwd: dir });
    if (child.pid) {
      sandbox.registerPid(child.pid);
      expect(sandbox.getPids()).toContain(child.pid);
    } else {
      throw new Error('Failed to spawn test process');
    }
  });

  it('Should kill process trees and remove sandbox directory on teardown', async () => {
    sandbox = new SandboxEnvironment();
    const dir = await sandbox.create();

    const child = spawn('node', ['-e', 'setTimeout(() => {}, 10000)'], { cwd: dir });
    if (child.pid) {
      sandbox.registerPid(child.pid);
    }

    await sandbox.cleanup();

    expect(fs.existsSync(dir)).toBe(false);
    expect(sandbox.getPids().length).toBe(0);
    sandbox = null;
  });
});
