import fs from 'fs';
import path from 'path';

export interface BootstrapConfig {
  currentPhase?: string;
  steeringRules?: string[];
  [key: string]: unknown;
}

export interface TaskItem {
  id: string;
  title?: string;
  status: string;
}

export class OrchestrationStateValidator {
  private sandboxDir: string;

  constructor(sandboxDir: string) {
    this.sandboxDir = path.resolve(sandboxDir);
  }

  public getBootstrapConfig(): BootstrapConfig {
    const configPath = path.join(this.sandboxDir, 'docs', 'product', 'BOOTSTRAP-CONFIG.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`BOOTSTRAP-CONFIG.json not found at: ${configPath}`);
    }
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content) as BootstrapConfig;
  }

  public assertPhase(expectedPhase: string): void {
    const config = this.getBootstrapConfig();
    if (config.currentPhase !== expectedPhase) {
      throw new Error(
        `Expected currentPhase to be "${expectedPhase}", but found "${config.currentPhase}"`
      );
    }
  }

  public getBacklogTasks(): TaskItem[] {
    const backlogPath = path.join(this.sandboxDir, 'docs', 'product', 'BACKLOG.md');
    if (!fs.existsSync(backlogPath)) {
      throw new Error(`BACKLOG.md not found at: ${backlogPath}`);
    }
    const content = fs.readFileSync(backlogPath, 'utf8');
    const lines = content.split('\n');
    const tasks: TaskItem[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Check markdown table format: | ID | Title | Domain | ... | Status |
      if (line.startsWith('|')) {
        const cells = line.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, '').replace(/\*\*/g, ''));
        if (cells.length >= 10) {
          const id = cells[0];
          const title = cells[1];
          const status = cells[9];

          if (id && id !== 'ID' && !id.startsWith('---')) {
            tasks.push({
              id,
              title,
              status,
            });
            continue;
          }
        }
      }

      // Check bullet list format: - [ ] Task title
      const taskMatch = line.match(/^-\s*\[([ xX])\]\s*(.*)$/);
      if (taskMatch) {
        const isChecked = taskMatch[1].toLowerCase() === 'x';
        const text = taskMatch[2].trim();

        let status = isChecked ? 'COMPLETED' : 'NOT_STARTED';
        if (text.includes('(IN_PROGRESS)')) {
          status = 'IN_PROGRESS';
        } else if (text.includes('(NOT_STARTED)')) {
          status = 'NOT_STARTED';
        } else if (text.includes('(COMPLETED)')) {
          status = 'COMPLETED';
        } else if (text.includes('(BLOCKED)')) {
          status = 'BLOCKED';
        }

        const idMatch = text.match(/\[(T\d+|0\d+|\d+)\]/) || text.match(/Task\s*(\d+)/i);
        const id = idMatch ? idMatch[1] : `task-${tasks.length + 1}`;

        tasks.push({
          id,
          title: text,
          status,
        });
      }
    }

    return tasks;
  }

  public assertTaskStatuses(expectedStatus: string): void {
    const tasks = this.getBacklogTasks();
    if (tasks.length === 0) {
      throw new Error(`No tasks found in BACKLOG.md to check status`);
    }

    const mismatched = tasks.filter((task) => task.status !== expectedStatus);
    if (mismatched.length > 0) {
      const details = mismatched.map((t) => `${t.id}: ${t.status}`).join(', ');
      throw new Error(
        `Expected all tasks to have status "${expectedStatus}", but found mismatched tasks: ${details}`
      );
    }
  }

  public getDecisionsLog(): string[] {
    const decisionsPath = path.join(this.sandboxDir, 'docs', 'product', 'DECISIONS.md');
    if (!fs.existsSync(decisionsPath)) {
      throw new Error(`DECISIONS.md not found at: ${decisionsPath}`);
    }
    const content = fs.readFileSync(decisionsPath, 'utf8');
    return content.split('\n');
  }

  public assertDecisionsLog(expectedContent: string | string[]): void {
    const log = this.getDecisionsLog();
    const fullText = log.join('\n');
    const expectedList = Array.isArray(expectedContent) ? expectedContent : [expectedContent];

    for (const expected of expectedList) {
      if (!fullText.includes(expected)) {
        throw new Error(
          `Expected DECISIONS.md to contain "${expected}", but string was not found in decisions log.`
        );
      }
    }
  }
}
