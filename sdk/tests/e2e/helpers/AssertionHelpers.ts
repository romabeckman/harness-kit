import fs from 'fs';
import path from 'path';

export interface BootstrapConfigJSON {
  steeringRules?: string[];
  [key: string]: unknown;
}

export function assertProductState(sandboxDir: string): void {
  const productDir = path.join(sandboxDir, 'docs', 'product');

  if (!fs.existsSync(productDir)) {
    throw new Error(`Product state directory missing: ${productDir}`);
  }

  const requiredFiles = ['BACKLOG.md', 'DECISIONS.md', 'DEVELOPMENT-STATE.md', 'BOOTSTRAP-CONFIG.json'];

  const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(productDir, file)));

  if (missing.length > 0) {
    throw new Error(`Missing product state files in ${productDir}: ${missing.join(', ')}`);
  }
}

export function readBootstrapConfig(sandboxDir: string): BootstrapConfigJSON {
  const configPath = path.join(sandboxDir, 'docs', 'product', 'BOOTSTRAP-CONFIG.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`BOOTSTRAP-CONFIG.json does not exist at: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf8');
  try {
    return JSON.parse(content) as BootstrapConfigJSON;
  } catch (err) {
    throw new Error(`Invalid JSON in BOOTSTRAP-CONFIG.json at ${configPath}: ${(err as Error).message}`);
  }
}

export function readBacklog(sandboxDir: string): string {
  const backlogPath = path.join(sandboxDir, 'docs', 'product', 'BACKLOG.md');

  if (!fs.existsSync(backlogPath)) {
    throw new Error(`BACKLOG.md does not exist at: ${backlogPath}`);
  }

  return fs.readFileSync(backlogPath, 'utf8');
}

export function assertSteeringRules(sandboxDir: string, expectedRules: string[]): void {
  const config = readBootstrapConfig(sandboxDir);
  const rules = config.steeringRules || [];

  for (const expected of expectedRules) {
    if (!rules.includes(expected)) {
      throw new Error(`Expected steering rule "${expected}" not found in BOOTSTRAP-CONFIG.json (${JSON.stringify(rules)})`);
    }
  }
}

export function computeDirChecksum(dirPath: string): string {
  if (!fs.existsSync(dirPath)) return '';
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const fileBuffer = fs.readFileSync(fullPath);
        hash.update(entry.name);
        hash.update(fileBuffer);
      }
    }
  }

  walk(dirPath);
  return hash.digest('hex');
}

export function assertReadOnlyPathUnchanged(dirPath: string, initialChecksum: string): void {
  const currentChecksum = computeDirChecksum(dirPath);
  if (currentChecksum !== initialChecksum) {
    throw new Error(`Read-only boundary violation: checksum changed for ${dirPath}`);
  }
}

export function assertReportDashboardOutput(stdout: string): void {
  if (!stdout) {
    throw new Error('Report stdout is empty');
  }
  const hasBacklog = stdout.includes('BACKLOG') || stdout.includes('Progress') || stdout.includes('Task') || stdout.includes('Summary');
  const hasCost = stdout.includes('Cost') || stdout.includes('$') || stdout.includes('USD') || stdout.includes('Tokens');
  if (!hasBacklog && !hasCost) {
    throw new Error(`Report dashboard output missing expected elements. Got stdout:\n${stdout}`);
  }
}

