import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import { HttpServerError } from '../../domain/types'

const BRANCH_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._\/-]*$/
const MAX_BRANCH_LENGTH = 255

function validateBranchName(branch: string): void {
  if (!branch || branch.length > MAX_BRANCH_LENGTH || !BRANCH_NAME_PATTERN.test(branch)) {
    throw new HttpServerError(400, 'INVALID_BRANCH_NAME', `Branch name '${branch.slice(0, 50)}' contains invalid characters or is too long.`)
  }
}

const execFileAsync = promisify(execFile)

async function execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd, encoding: 'utf-8' })
    return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 }
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? err.message ?? '', exitCode: err.code ?? 1 }
  }
}

export interface SyncWorkspaceRequestDto {
  project: string
}

export interface SyncWorkspaceResponseDto {
  status: string
  project: string
  workspacePath: string
  baseBranch: string
  fetchedAt: string
}

export class SyncWorkspaceRepositoryUseCase {
  private static pendingSyncs = new Map<string, Promise<void>>()

  async execute(dto: SyncWorkspaceRequestDto): Promise<SyncWorkspaceResponseDto> {
    if (!dto.project || typeof dto.project !== 'string' || dto.project.trim() === '') {
      throw new HttpServerError(400, 'MISSING_PROJECT_PARAMETER', "Parameter 'project' is required.")
    }

    const envInfo = DtoMappers.resolveProjectFromEnv(dto.project)
    if (!envInfo?.path) {
      throw new HttpServerError(400, 'PROJECT_NOT_FOUND', `Project '${dto.project}' is not registered in environment variables.`)
    }

    const workspacePath = envInfo.path
    if (!existsSync(join(workspacePath, '.git'))) {
      throw new HttpServerError(400, 'NOT_A_GIT_REPOSITORY', `Workspace at '${workspacePath}' is not initialized with a .git repository.`)
    }

    const targetBranch = envInfo.baseBranch ?? process.env.BASE_BRANCH ?? 'main'
    validateBranchName(targetBranch)
    const syncKey = `${workspacePath}:${targetBranch}`

    // Schedule background non-blocking fetch with deduplication
    if (!SyncWorkspaceRepositoryUseCase.pendingSyncs.has(syncKey)) {
      const syncTask = (async () => {
        const fetchRes = await execGit(['fetch', 'origin', targetBranch], workspacePath)
        if (fetchRes.exitCode !== 0) {
          await execGit(['fetch', '--all'], workspacePath)
        }
      })().finally(() => {
        SyncWorkspaceRepositoryUseCase.pendingSyncs.delete(syncKey)
      })

      SyncWorkspaceRepositoryUseCase.pendingSyncs.set(syncKey, syncTask)
    }

    return {
      status: 'synced',
      project: dto.project,
      workspacePath,
      baseBranch: targetBranch,
      fetchedAt: new Date().toISOString(),
    }
  }

  static getActiveSyncsCount(): number {
    return SyncWorkspaceRepositoryUseCase.pendingSyncs.size
  }

  static async awaitAllPendingSyncs(): Promise<void> {
    await Promise.all(Array.from(SyncWorkspaceRepositoryUseCase.pendingSyncs.values()))
  }
}
