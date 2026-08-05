import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import spawn from 'cross-spawn';

export interface SandboxOptions {
  prefix?: string;
  tempParentDir?: string;
  autoClean?: boolean;
}

export class SandboxEnvironment {
  private dirPath: string = '';
  private pids: number[] = [];
  private prefix: string;
  private tempParentDir: string;

  constructor(options: SandboxOptions = {}) {
    this.prefix = options.prefix || 'hrns-e2e-';
    this.tempParentDir = options.tempParentDir
      ? path.resolve(options.tempParentDir)
      : path.resolve(process.cwd(), 'tests/e2e/.temp');
  }

  public async create(): Promise<string> {
    if (!fs.existsSync(this.tempParentDir)) {
      fs.mkdirSync(this.tempParentDir, { recursive: true });
    }

    const uniqueId = randomUUID();
    const folderName = `${this.prefix}${uniqueId}`;
    const rawPath = path.join(this.tempParentDir, folderName);

    fs.mkdirSync(rawPath, { recursive: true });
    this.dirPath = fs.realpathSync(rawPath);

    return this.dirPath;
  }

  public getDirPath(): string {
    return this.dirPath;
  }

  public registerPid(pid: number): void {
    if (pid && !this.pids.includes(pid)) {
      this.pids.push(pid);
    }
  }

  public getPids(): number[] {
    return [...this.pids];
  }

  public async killProcessTree(pid: number): Promise<void> {
    try {
      if (process.platform === 'win32') {
        spawn.sync('taskkill', ['/F', '/T', '/PID', pid.toString()]);
      } else {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          process.kill(pid, 'SIGKILL');
        }
      }
    } catch {
      // Process already terminated or invalid PID
    }
  }

  public async cleanup(): Promise<void> {
    // 1. Terminate tracked subprocesses
    for (const pid of this.pids) {
      await this.killProcessTree(pid);
    }
    this.pids = [];

    // 2. Validate directory path safety before deletion
    if (!this.dirPath || !fs.existsSync(this.dirPath)) {
      return;
    }

    const realPath = fs.realpathSync(this.dirPath);
    const realTempParent = fs.existsSync(this.tempParentDir)
      ? fs.realpathSync(this.tempParentDir)
      : this.tempParentDir;
    const realOsTmp = fs.realpathSync(os.tmpdir());

    const residesInTempDir = realPath.startsWith(realTempParent);
    const residesInOsTmpDir = realPath.startsWith(realOsTmp);
    const hasPrefix = path.basename(realPath).startsWith(this.prefix);

    if ((residesInTempDir || residesInOsTmpDir) && hasPrefix) {
      try {
        fs.rmSync(realPath, { recursive: true, force: true });
      } catch (err) {
        // Fallback for Windows file locks
        try {
          await new Promise((resolve) => setTimeout(resolve, 200));
          fs.rmSync(realPath, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }
    }

    this.dirPath = '';
  }
}
