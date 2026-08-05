import fs from 'fs';
import path from 'path';

export interface MockAgentOptions {
  delayMs?: number;
  exitCode?: number;
  stdoutPayload?: string;
  stderrPayload?: string;
  autoGenerateProductState?: boolean;
}

export async function setupMockAgent(
  sandboxDir: string,
  options: MockAgentOptions = {}
): Promise<string> {
  const delayMs = options.delayMs || 0;
  const exitCode = options.exitCode ?? 0;
  const stdoutPayload = options.stdoutPayload ?? '{"type":"result","result":"success"}';
  const stderrPayload = options.stderrPayload ?? '';
  const autoGenerate = options.autoGenerateProductState ?? true;

  const scriptContent = `
const fs = require('fs');
const path = require('path');

const delayMs = ${delayMs};
const exitCode = ${exitCode};
const stdoutPayload = ${JSON.stringify(stdoutPayload)};
const stderrPayload = ${JSON.stringify(stderrPayload)};
const autoGenerate = ${autoGenerate};

if (autoGenerate) {
  try {
    let targetDir = process.cwd();
    for (let i = 0; i < process.argv.length; i++) {
      if ((process.argv[i] === '--add-dir' || process.argv[i] === '--path') && process.argv[i + 1]) {
        targetDir = process.argv[i + 1];
        break;
      }
    }

    const productDir = path.join(targetDir, 'docs', 'product');
    const backlogPath = path.join(productDir, 'BACKLOG.md');
    if (!fs.existsSync(productDir)) {
      fs.mkdirSync(productDir, { recursive: true });
    }

    const existingBacklog = fs.existsSync(backlogPath) ? fs.readFileSync(backlogPath, 'utf8') : '';
    if (!existingBacklog.includes('F001')) {
      const backlogTable = "# BACKLOG\\n" +
        "| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |\\n" +
        "|---|---|---|---|---|---|---|---|---|---|\\n" +
        "| F001 | E2E Lifecycle Feature | e2e_feature | backend | 1 | None | 0 | - | - | NOT_STARTED |\\n";
      fs.writeFileSync(backlogPath, backlogTable);
    }

    const specDir = path.join(targetDir, 'docs', 'specs', 'e2e_feature');
    if (!fs.existsSync(specDir)) {
      fs.mkdirSync(specDir, { recursive: true });
    }

    const tacticalDesignPath = path.join(specDir, '003-e2e_feature-tactical-design.md');
    if (!fs.existsSync(tacticalDesignPath)) {
      const tacticalContent = "# Tactical Design\\n\\n" +
        "## Section 6 — Ordered Development Tasks\\n\\n" +
        "\`\`\`json\\n" +
        "[\\n" +
        "  {\\n" +
        '    "id": "01",\\n' +
        '    "title": "Implement E2E Lifecycle core feature logic",\\n' +
        '    "description": "Implement E2E Lifecycle core feature logic",\\n' +
        '    "scope": ["src/index.ts"]\\n' +
        "  }\\n" +
        "]\\n" +
        "\`\`\`\\n";
      fs.writeFileSync(tacticalDesignPath, tacticalContent);
    }

    const specFiles = ['001-problem-space.md', '002-context-map.md', '004-test-scenarios.md'];
    for (const f of specFiles) {
      const p = path.join(specDir, f);
      if (!fs.existsSync(p)) fs.writeFileSync(p, '# Mock Spec: ' + f);
    }

    const tddPath = path.join(specDir, 'TDD-OUTPUT.json');
    if (!fs.existsSync(tddPath)) {
      fs.writeFileSync(tddPath, JSON.stringify({
        featureId: 'F001',
        status: 'SUCCESS',
        metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 },
        modifiedFiles: [],
        reworksCount: 0
      }, null, 2));
    }
  } catch (err) {
    // Ignore state generation errors in mock agent
  }
}

setTimeout(() => {
  if (stdoutPayload) {
    process.stdout.write(stdoutPayload + '\\n');
  }
  if (stderrPayload) {
    process.stderr.write(stderrPayload + '\\n');
  }
  process.exit(exitCode);
}, delayMs);
`;

  const scriptPath = path.join(sandboxDir, 'mock-agent.js');
  fs.writeFileSync(scriptPath, scriptContent, { encoding: 'utf8', mode: 0o755 });

  return scriptPath;
}

export async function setupMockBinaryInPath(
  sandboxDir: string,
  binaryNames: string[] = ['agy', 'claude'],
  options: MockAgentOptions = {}
): Promise<Record<string, string>> {
  const binDir = path.join(sandboxDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const scriptPath = await setupMockAgent(binDir, options);

  for (const name of binaryNames) {
    const cmdPath = path.join(binDir, `${name}.cmd`);
    const shPath = path.join(binDir, name);

    const cmdContent = `@echo off\nnode "${scriptPath}" %*\n`;
    const shContent = `#!/bin/sh\nnode "${scriptPath}" "$@"\n`;

    fs.writeFileSync(cmdPath, cmdContent, { encoding: 'utf8' });
    fs.writeFileSync(shPath, shContent, { encoding: 'utf8', mode: 0o755 });
  }

  const currentPath = process.env.PATH || '';
  const newPath = `${binDir}${path.delimiter}${currentPath}`;

  return {
    PATH: newPath,
  };
}

export class MockAgentCli {
  private scriptPath: string = '';

  constructor(private sandboxDir: string, private options: MockAgentOptions = {}) {}

  public async setup(): Promise<string> {
    this.scriptPath = await setupMockAgent(this.sandboxDir, this.options);
    return this.scriptPath;
  }

  public getScriptPath(): string {
    return this.scriptPath;
  }
}
