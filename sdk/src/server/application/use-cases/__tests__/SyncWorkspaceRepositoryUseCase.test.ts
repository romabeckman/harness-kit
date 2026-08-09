import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SyncWorkspaceRepositoryUseCase } from '../SyncWorkspaceRepositoryUseCase'
import { HttpServerError } from '../../../domain/types'

describe('SyncWorkspaceRepositoryUseCase', () => {
  const originalEnv = { ...process.env }
  const testWorkspacePath = join(__dirname, 'test-sync-workspace')

  beforeEach(() => {
    delete process.env.PROJECT_MAPPINGS
    delete process.env.PROJECT_TESTPROJ_PATH
    delete process.env.PROJECT_TESTPROJ_BASE_BRANCH
    if (rmSync) {
      rmSync(testWorkspacePath, { recursive: true, force: true })
    }
  })

  afterEach(async () => {
    process.env = { ...originalEnv }
    await SyncWorkspaceRepositoryUseCase.awaitAllPendingSyncs()
    rmSync(testWorkspacePath, { recursive: true, force: true })
  })

  it('rejects request with missing project parameter', async () => {
    const useCase = new SyncWorkspaceRepositoryUseCase()
    await expect(useCase.execute({ project: '' })).rejects.toThrowError(HttpServerError)
  })

  it('rejects request if project is not registered in environment', async () => {
    const useCase = new SyncWorkspaceRepositoryUseCase()
    await expect(useCase.execute({ project: 'unknown-project' })).rejects.toThrowError(HttpServerError)
  })

  it('rejects request if workspace directory is not a git repository', async () => {
    mkdirSync(testWorkspacePath, { recursive: true })
    process.env.PROJECT_TESTPROJ_PATH = testWorkspacePath

    const useCase = new SyncWorkspaceRepositoryUseCase()
    await expect(useCase.execute({ project: 'testproj' })).rejects.toThrowError(HttpServerError)
  })

  it('successfully executes git fetch sync on valid git repository workspace', async () => {
    mkdirSync(join(testWorkspacePath, '.git'), { recursive: true })
    writeFileSync(join(testWorkspacePath, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    process.env.PROJECT_TESTPROJ_PATH = testWorkspacePath
    process.env.PROJECT_TESTPROJ_BASE_BRANCH = 'develop'

    const useCase = new SyncWorkspaceRepositoryUseCase()
    const result = await useCase.execute({ project: 'testproj' })

    expect(result.status).toBe('synced')
    expect(result.project).toBe('testproj')
    expect(result.baseBranch).toBe('develop')
    expect(result.workspacePath).toBe(testWorkspacePath)
    expect(result.fetchedAt).toBeDefined()
  })
  
  it('SEC-BRANCH: Rejects branch names with invalid characters', async () => {
    // Create a fake workspace with .git to pass the git repository check
    mkdirSync(join(testWorkspacePath, '.git'), { recursive: true })
    writeFileSync(join(testWorkspacePath, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    process.env.PROJECT_MAPPINGS = JSON.stringify({ backend: { path: testWorkspacePath, baseBranch: 'main; rm -rf /' } })
    const uc = new SyncWorkspaceRepositoryUseCase()
    await expect(uc.execute({ project: 'backend' })).rejects.toThrow('contains invalid characters')
  })
})
