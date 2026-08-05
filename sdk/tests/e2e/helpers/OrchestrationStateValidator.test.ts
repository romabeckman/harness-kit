import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SandboxEnvironment } from './SandboxEnvironment';
import { OrchestrationStateValidator } from './OrchestrationStateValidator';

describe('OrchestrationStateValidator Helper Unit Tests', () => {
  let sandbox: SandboxEnvironment | null = null;
  let sandboxDir: string = '';

  beforeEach(async () => {
    sandbox = new SandboxEnvironment();
    sandboxDir = await sandbox.create();

    const productDir = path.join(sandboxDir, 'docs', 'product');
    fs.mkdirSync(productDir, { recursive: true });
  });

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('Should assert correct phase in BOOTSTRAP-CONFIG.json without modifying target file', () => {
    const configPath = path.join(sandboxDir, 'docs', 'product', 'BOOTSTRAP-CONFIG.json');
    const initialContent = JSON.stringify({ currentPhase: 'PLANNING', steeringRules: ['use Zod'] }, null, 2);
    fs.writeFileSync(configPath, initialContent);

    const validator = new OrchestrationStateValidator(sandboxDir);

    expect(() => validator.assertPhase('PLANNING')).not.toThrow();
    expect(() => validator.assertPhase('DEVELOPMENT')).toThrow();

    const currentContent = fs.readFileSync(configPath, 'utf8');
    expect(currentContent).toBe(initialContent);
  });

  it('Should verify task status in BACKLOG.md matches expected state', () => {
    const backlogPath = path.join(sandboxDir, 'docs', 'product', 'BACKLOG.md');
    const backlogContent = `# Backlog

- [ ] Task 1 (NOT_STARTED)
- [ ] Task 2 (NOT_STARTED)
`;
    fs.writeFileSync(backlogPath, backlogContent);

    const validator = new OrchestrationStateValidator(sandboxDir);

    expect(() => validator.assertTaskStatuses('NOT_STARTED')).not.toThrow();
    expect(() => validator.assertTaskStatuses('COMPLETED')).toThrow();

    const tasks = validator.getBacklogTasks();
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].status).toBe('NOT_STARTED');
  });

  it('Should verify STEERING_ROLLBACK and injected rules appended to DECISIONS.md', () => {
    const decisionsPath = path.join(sandboxDir, 'docs', 'product', 'DECISIONS.md');
    const decisionsContent = `# Architectural Decisions

## Decision 001: Initial setup
## Event: STEERING_ROLLBACK to PLANNING
- Injected Rule: use Zod
`;
    fs.writeFileSync(decisionsPath, decisionsContent);

    const validator = new OrchestrationStateValidator(sandboxDir);

    expect(() => validator.assertDecisionsLog('STEERING_ROLLBACK')).not.toThrow();
    expect(() => validator.assertDecisionsLog(['STEERING_ROLLBACK', 'use Zod'])).not.toThrow();
    expect(() => validator.assertDecisionsLog('NON_EXISTENT_RULE')).toThrow();

    const logLines = validator.getDecisionsLog();
    expect(logLines.some((line) => line.includes('STEERING_ROLLBACK'))).toBe(true);
  });
});
