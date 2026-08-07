import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import { HttpServerError } from '../../domain/types'

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
  baseBranch?: string
}

export interface SyncWorkspaceResponseDto {
  status: string
  project: string
  workspacePath: string
  baseBranch: string
  fetchedAt: string
}

export class SyncWorkspaceRepositoryUseCase {
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

    const targetBranch = dto.baseBranch ?? envInfo.baseBranch ?? 'main'
    const fetchRes = await execGit(['fetch', 'origin', targetBranch], workspacePath)

    if (fetchRes.exitCode !== 0) {
      // Fallback fetch all
      await execGit(['fetch', '--all'], workspacePath)
    }

    return {
      status: 'synced',
      project: dto.project,
      workspacePath,
      baseBranch: targetBranch,
      fetchedAt: new Date().toISOString(),
    }
  }
}
