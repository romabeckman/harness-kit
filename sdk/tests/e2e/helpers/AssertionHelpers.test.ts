import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SandboxEnvironment } from './SandboxEnvironment';
import { assertProductState, assertSteeringRules } from './AssertionHelpers';

describe('AssertionHelpers Utility', () => {
  let sandbox: SandboxEnvironment | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should confirm presence of product state files when docs/product/ directory is populated', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const productDir = path.join(sandboxDir, 'docs', 'product');
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(path.join(productDir, 'BACKLOG.md'), '# Backlog');
    fs.writeFileSync(path.join(productDir, 'DECISIONS.md'), '# Decisions');
    fs.writeFileSync(path.join(productDir, 'DEVELOPMENT-STATE.md'), '# Development State');
    fs.writeFileSync(
      path.join(productDir, 'BOOTSTRAP-CONFIG.json'),
      JSON.stringify({ steeringRules: ['Rule 1'] }, null, 2)
    );

    expect(() => assertProductState(sandboxDir)).not.toThrow();
  });

  it('Should fail assertion when required product state file is missing in docs/product/', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const productDir = path.join(sandboxDir, 'docs', 'product');
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(path.join(productDir, 'BACKLOG.md'), '# Backlog');

    expect(() => assertProductState(sandboxDir)).toThrow();
  });

  it('Should validate steering rules in BOOTSTRAP-CONFIG.json', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const productDir = path.join(sandboxDir, 'docs', 'product');
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(
      path.join(productDir, 'BOOTSTRAP-CONFIG.json'),
      JSON.stringify({ steeringRules: ['Rule A', 'Rule B'] }, null, 2)
    );

    expect(() => assertSteeringRules(sandboxDir, ['Rule A'])).not.toThrow();
    expect(() => assertSteeringRules(sandboxDir, ['Rule C'])).toThrow();
  });
});
