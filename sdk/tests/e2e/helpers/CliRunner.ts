import path from 'path';
import spawn from 'cross-spawn';
import { ChildProcess } from 'child_process';
import { SandboxEnvironment } from './SandboxEnvironment';

export interface CliRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function getCliBinPath(): string {
  return path.resolve(__dirname, '../../../dist/cli/run.js');
}

export function spawnCliRunProcess(
  sandbox: SandboxEnvironment,
  sandboxDir: string,
  args: string[] = [],
  env: Record<string, string> = {}
): ChildProcess {
  const cliBin = getCliBinPath();
  const childEnv = {
    ...process.env,
    ...env,
    NODE_ENV: 'test',
  };

  const child = spawn('node', [cliBin, 'run', ...args], {
    cwd: sandboxDir,
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (child.pid) {
    sandbox.registerPid(child.pid);
  }

  return child;
}

export async function runCliRun(
  sandbox: SandboxEnvironment,
  sandboxDir: string,
  args: string[] = [],
  env: Record<string, string> = {}
): Promise<CliRunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const child = spawnCliRunProcess(sandbox, sandboxDir, args, env);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    if (child.stdin) {
      const inputBuffer = Array(15).fill('\n').join('');
      child.stdin.write(inputBuffer);
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
      });
    });

    child.on('error', (err) => {
      stderr += err.message;
      resolve({
        exitCode: 1,
        stdout,
        stderr,
      });
    });
  });
}

export async function runCliInit(
  sandbox: SandboxEnvironment,
  sandboxDir: string,
  args: string[] = [],
  env: Record<string, string> = {}
): Promise<CliRunResult> {
  const cliBin = getCliBinPath();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const childEnv = {
      ...process.env,
      ...env,
      NODE_ENV: 'test',
    };

    const child = spawn('node', [cliBin, 'init', ...args], {
      cwd: sandboxDir,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (child.pid) {
      sandbox.registerPid(child.pid);
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    if (child.stdin) {
      const inputBuffer = Array(15).fill('\n').join('');
      child.stdin.write(inputBuffer);
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
      });
    });

    child.on('error', (err) => {
      stderr += err.message;
      resolve({
        exitCode: 1,
        stdout,
        stderr,
      });
    });
  });
}

export async function runCliReport(
  sandbox: SandboxEnvironment,
  sandboxDir: string,
  args: string[] = [],
  env: Record<string, string> = {}
): Promise<CliRunResult> {
  const cliBin = getCliBinPath();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const childEnv = {
      ...process.env,
      ...env,
      NODE_ENV: 'test',
    };

    const child = spawn('node', [cliBin, 'report', ...args], {
      cwd: sandboxDir,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (child.pid) {
      sandbox.registerPid(child.pid);
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    if (child.stdin) {
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
      });
    });

    child.on('error', (err) => {
      stderr += err.message;
      resolve({
        exitCode: 1,
        stdout,
        stderr,
      });
    });
  });
}

