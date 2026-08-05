import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SandboxEnvironment } from '../helpers/SandboxEnvironment';
import { runCliReport } from '../helpers/CliRunner';
import { assertReportDashboardOutput } from '../helpers/AssertionHelpers';

describe('Scenario 5: Telemetry Reporting & Progress Dashboard (hrns report)', () => {
  let sandbox: SandboxEnvironment | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should stream-parse tokens.jsonl and render ANSI dashboard without mutating product state files', async () => {
    sandbox = new SandboxEnvironment();
    const sandboxDir = await sandbox.create();

    const productDir = path.join(sandboxDir, 'docs', 'product');
    fs.mkdirSync(productDir, { recursive: true });

    // Setup product state files
    fs.writeFileSync(path.join(productDir, 'BACKLOG.md'), '# BACKLOG\n| F003 | Test Feature | multi_project_telemetry_and_quota_e2e | backend | 1 | None | 0 | 0.8 | 0.8 | COMPLETED |\n');
    fs.writeFileSync(path.join(productDir, 'DEVELOPMENT-STATE.md'), '# Development State\n| F003 | T01 | backend | COMPLETED |\n');
    fs.writeFileSync(path.join(productDir, 'DECISIONS.md'), '# Architectural Decisions\n');
    fs.writeFileSync(path.join(productDir, 'BOOTSTRAP-CONFIG.json'), JSON.stringify({ currentPhase: 'HALTED', activeFeatureId: 'F003' }, null, 2));

    // Setup tokens.jsonl with valid lines and a malformed trailing line
    const telemetryDir = path.join(sandboxDir, 'docs', 'telemetry');
    fs.mkdirSync(telemetryDir, { recursive: true });
    const tokensFile = path.join(telemetryDir, 'tokens.jsonl');
    const tokenLogs = [
      JSON.stringify({ timestamp: '2026-08-04T20:00:00Z', phase: 'DEVELOPMENT', promptTokens: 1000, completionTokens: 500, costUsd: 0.005 }),
      JSON.stringify({ timestamp: '2026-08-04T20:05:00Z', phase: 'REVIEW', promptTokens: 2000, completionTokens: 1000, costUsd: 0.01 }),
      '{"timestamp":"2026-08-04T20:10:00Z","phase":"DEVELOPMENT","promptTokens":'
    ].join('\n');
    fs.writeFileSync(tokensFile, tokenLogs);

    const backlogContentPre = fs.readFileSync(path.join(productDir, 'BACKLOG.md'), 'utf8');

    const res = await runCliReport(sandbox, sandboxDir);

    expect(res.exitCode).toBe(0);
    assertReportDashboardOutput(res.stdout);

    // Assert zero side-effect mutations to docs/product/
    const backlogContentPost = fs.readFileSync(path.join(productDir, 'BACKLOG.md'), 'utf8');
    expect(backlogContentPost).toBe(backlogContentPre);
  }, 60000);
});
